-- =============================================================
-- Fase 9.5 — tessere prepagate a consumo.
--   - prepaid_products: i tipi di tessera del negozio (es. "Tessera fotocopie", 150 pagine);
--   - prepaid_cards: la tessera di un cliente (QR e codice breve propri, saldo, scadenza);
--     stato "da attivare" finché l'esercente non incassa e la attiva;
--   - prepaid_events: storico di attivazioni, consumi, ricariche e correzioni (e annullamenti);
--   - shops.loyalty_enabled: un negozio può offrire solo le tessere;
--   - funzioni atomiche con audit_log, idempotenza come card_action;
--   - sincronizzazione Google estesa alle tessere (prepaid_sync_state, coda dei tentativi).
-- Il pagamento avviene sempre fuori dall'app: attivazione e ricarica significano "pagamento ricevuto".
-- =============================================================

alter table shops add column loyalty_enabled boolean not null default true;

-- ---------- tipi di tessera ----------

create table prepaid_products (
  id              uuid primary key default gen_random_uuid(),
  shop_id         uuid not null references shops(id) on delete cascade,
  -- parte dell'indirizzo di iscrizione: /<negozio>/t/<code>
  code            text not null check (code ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(code) between 2 and 30),
  name            text not null check (length(trim(name)) between 2 and 40),
  units           int  not null check (units between 1 and 10000),
  unit_singular   text not null check (length(trim(unit_singular)) between 2 and 20),
  unit_plural     text not null check (length(trim(unit_plural)) between 2 and 20),
  -- durata dalla attivazione o dall'ultima ricarica; null = nessuna scadenza
  validity_months int  check (validity_months between 1 and 60),
  active          boolean not null default true,
  -- sale quando cambia qualcosa di visibile sulla tessera: le carte vanno riallineate
  card_version    int  not null default 1,
  created_at      timestamptz not null default now(),
  unique (shop_id, code)
);
alter table prepaid_products enable row level security;

-- ---------- tessere dei clienti ----------

create table prepaid_cards (
  id             uuid primary key default gen_random_uuid(),
  shop_id        uuid not null references shops(id) on delete cascade,
  product_id     uuid not null references prepaid_products(id) on delete cascade,
  -- la persona (nome, telefono, consensi) è la riga di customers del negozio
  customer_id    uuid not null references customers(id) on delete cascade,
  qr_token       text not null unique default encode(gen_random_bytes(16), 'hex'),
  short_code     text not null,
  status         text not null default 'pending' check (status in ('pending', 'active')),
  balance        int  not null default 0 check (balance >= 0),
  -- saldo subito dopo l'ultima attivazione o ricarica: "138 di 150 pagine"
  charged_units  int  not null default 0 check (charged_units >= 0),
  activated_at   timestamptz,
  last_charged_at timestamptz,
  expires_at     timestamptz,
  created_at     timestamptz not null default now(),
  deleted_at     timestamptz,
  constraint prepaid_cards_active check ((status = 'active') = (activated_at is not null))
);
create unique index prepaid_cards_shop_short_code_key on prepaid_cards (shop_id, short_code);
create unique index prepaid_cards_product_customer_key on prepaid_cards (product_id, customer_id) where deleted_at is null;
create index prepaid_cards_customer_idx on prepaid_cards (customer_id);
alter table prepaid_cards enable row level security;

create table prepaid_events (
  id             bigint generated always as identity primary key,
  card_id        uuid not null references prepaid_cards(id) on delete cascade,
  shop_id        uuid not null references shops(id) on delete cascade,
  kind           text not null check (kind in ('activate', 'consume', 'recharge', 'adjust')),
  quantity       int  not null,
  balance_before int  not null,
  balance_after  int  not null,
  staff_user_id  uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  undone_at      timestamptz,
  undone_by      uuid references auth.users(id) on delete set null
);
create index prepaid_events_card_idx on prepaid_events (card_id, id desc);
create index prepaid_events_shop_idx on prepaid_events (shop_id, created_at desc);
alter table prepaid_events enable row level security;

-- iscrizione dal web a una tessera (null = carta fedeltà)
alter table enrollment_sessions add column prepaid_product_id uuid references prepaid_products(id) on delete set null;

-- idempotenza: le azioni sulle tessere usano la stessa tabella delle azioni sul saldo;
-- customer_id contiene l'id della carta (cliente per la fedeltà, tessera per le tessere)
alter table action_keys drop constraint action_keys_action_check;
alter table action_keys add constraint action_keys_action_check
  check (action in ('stamp', 'undo', 'redeem', 'prepaid_activate', 'prepaid_consume', 'prepaid_recharge', 'prepaid_undo'));
comment on column action_keys.customer_id is 'Carta su cui si agisce: id del cliente (fedeltà) o della tessera (prepaid_*).';

-- ---------- helper ----------

-- Stato leggibile: da attivare, attiva, esaurita, scaduta.
create or replace function _prepaid_state(p_c prepaid_cards)
returns text
language sql
stable
as $$
  select case
    when p_c.status = 'pending' then 'da_attivare'
    when p_c.expires_at is not null and p_c.expires_at <= now() then 'scaduta'
    when p_c.balance = 0 then 'esaurita'
    else 'attiva'
  end;
$$;

create or replace function _prepaid_json(p_c prepaid_cards, p_p prepaid_products)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'card_id', p_c.id, 'short_code', p_c.short_code, 'qr_token', p_c.qr_token, 'customer_id', p_c.customer_id,
    'product_id', p_p.id, 'product_name', p_p.name, 'unit_singular', p_p.unit_singular, 'unit_plural', p_p.unit_plural,
    'units', p_p.units, 'status', p_c.status, 'state', _prepaid_state(p_c), 'balance', p_c.balance,
    'charged_units', p_c.charged_units, 'activated_at', p_c.activated_at, 'expires_at', p_c.expires_at,
    'deleted', p_c.deleted_at is not null
  );
$$;

-- Carta bloccata per l'operazione; errori del catalogo se non esiste, è cancellata o il negozio è sospeso.
create or replace function _prepaid_lock(p_card_id uuid)
returns prepaid_cards
language plpgsql
set search_path = public
as $$
declare
  v_c prepaid_cards;
  v_s shops;
begin
  select * into v_c from prepaid_cards where id = p_card_id for update;
  if not found or v_c.deleted_at is not null then
    perform _raise('E_CARD_NOT_FOUND', jsonb_build_object('card_id', p_card_id));
  end if;
  select * into v_s from shops where id = v_c.shop_id;
  if v_s.status <> 'active' then
    perform _raise('E_SHOP_SUSPENDED', jsonb_build_object('shop_id', v_s.id));
  end if;
  return v_c;
end;
$$;

create or replace function _prepaid_expiry(p_p prepaid_products)
returns timestamptz
language sql
stable
as $$
  select case when p_p.validity_months is null then null else now() + make_interval(months => p_p.validity_months) end;
$$;

-- ---------- tipi di tessera (titolare) ----------

-- Crea (p_product_id null) o modifica un tipo di tessera. p_fields: code, name, units, unit_singular,
-- unit_plural, validity_months (null = senza scadenza), active. Solo il titolare.
create or replace function prepaid_product_save(p_shop_id uuid, p_product_id uuid, p_fields jsonb, p_meta jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff staff;
  v_old prepaid_products;
  v_new prepaid_products;
  v_visible boolean;
begin
  v_staff := _require_staff(p_meta, p_shop_id, true);
  if p_product_id is null then
    if exists (select 1 from prepaid_products where shop_id = p_shop_id and code = p_fields->>'code') then
      perform _raise('E_VALIDATION', jsonb_build_object('field', 'code', 'problem', 'indirizzo già usato da un''altra tessera'));
    end if;
    insert into prepaid_products (shop_id, code, name, units, unit_singular, unit_plural, validity_months, active)
    values (p_shop_id, p_fields->>'code', trim(p_fields->>'name'), (p_fields->>'units')::int,
            trim(p_fields->>'unit_singular'), trim(p_fields->>'unit_plural'),
            nullif(p_fields->>'validity_months', '')::int, coalesce((p_fields->>'active')::boolean, true))
    returning * into v_new;
    perform _audit(p_meta, p_shop_id, 'prepaid_product_create', 'prepaid_product', v_new.id::text, null, to_jsonb(v_new));
    return to_jsonb(v_new) || jsonb_build_object('created', true, 'changes', '[]'::jsonb) || _staff_json(v_staff);
  end if;

  select * into v_old from prepaid_products where id = p_product_id and shop_id = p_shop_id for update;
  if not found then
    perform _raise('E_PREPAID_PRODUCT_NOT_FOUND', jsonb_build_object('product_id', p_product_id));
  end if;
  update prepaid_products set
    name            = coalesce(trim(p_fields->>'name'), name),
    units           = coalesce((p_fields->>'units')::int, units),
    unit_singular   = coalesce(trim(p_fields->>'unit_singular'), unit_singular),
    unit_plural     = coalesce(trim(p_fields->>'unit_plural'), unit_plural),
    validity_months = case when p_fields ? 'validity_months' then nullif(p_fields->>'validity_months', '')::int
                           else validity_months end,
    active          = coalesce((p_fields->>'active')::boolean, active)
  where id = p_product_id
  returning * into v_new;
  v_visible := (v_old.name, v_old.unit_singular, v_old.unit_plural) is distinct from
               (v_new.name, v_new.unit_singular, v_new.unit_plural);
  if v_visible then
    update prepaid_products set card_version = card_version + 1 where id = p_product_id returning * into v_new;
  end if;
  if to_jsonb(v_old) - 'card_version' is distinct from to_jsonb(v_new) - 'card_version' then
    perform _audit(p_meta, p_shop_id, 'prepaid_product_update', 'prepaid_product', v_new.id::text,
                   to_jsonb(v_old) - 'card_version', to_jsonb(v_new) - 'card_version');
  end if;
  return to_jsonb(v_new) || jsonb_build_object('created', false, 'card_changed', v_visible,
                                               'before', to_jsonb(v_old)) || _staff_json(v_staff);
end;
$$;

-- ---------- iscrizione (cliente, dal web) ----------

-- La persona è il cliente del negozio (creato o ritrovato con lo stesso telefono); la tessera è
-- una per tipo: chi si iscrive di nuovo ritrova la sua. Nasce "da attivare", con saldo 0.
create or replace function prepaid_enroll(
  p_product_id uuid, p_name text, p_phone text, p_consent_privacy boolean, p_consent_marketing boolean, p_meta jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_p prepaid_products;
  v_person jsonb;
  v_customer uuid;
  v_c prepaid_cards;
  v_code text;
begin
  select * into v_p from prepaid_products where id = p_product_id;
  if not found or not v_p.active then
    perform _raise('E_PREPAID_PRODUCT_NOT_FOUND', jsonb_build_object('product_id', p_product_id));
  end if;
  v_person := enroll_customer(v_p.shop_id, p_name, p_phone, p_consent_privacy, p_consent_marketing, p_meta);
  v_customer := (v_person->>'customer_id')::uuid;

  select * into v_c from prepaid_cards where product_id = v_p.id and customer_id = v_customer and deleted_at is null;
  if found then
    return _prepaid_json(v_c, v_p) || jsonb_build_object('returning', true, 'person_returning', (v_person->>'returning')::boolean);
  end if;

  for attempt in 1..10 loop
    v_code := generate_short_code();
    exit when not exists (select 1 from customers where shop_id = v_p.shop_id and short_code = v_code)
          and not exists (select 1 from prepaid_cards where shop_id = v_p.shop_id and short_code = v_code);
  end loop;
  insert into prepaid_cards (shop_id, product_id, customer_id, short_code)
  values (v_p.shop_id, v_p.id, v_customer, v_code)
  returning * into v_c;

  perform _audit(p_meta || jsonb_build_object('actor_type', 'customer', 'actor_id', v_customer),
                 v_p.shop_id, 'prepaid_enroll', 'prepaid_card', v_c.id::text, null,
                 jsonb_build_object('short_code', v_c.short_code, 'product', v_p.name, 'status', 'pending'));
  return _prepaid_json(v_c, v_p) || jsonb_build_object('returning', false, 'person_returning', (v_person->>'returning')::boolean);
end;
$$;

-- ---------- operazioni in cassa (titolare o operatore) ----------

create or replace function _prepaid_charge(p_card_id uuid, p_meta jsonb, p_kind text)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_c prepaid_cards;
  v_p prepaid_products;
  v_staff staff;
  v_before int;
begin
  v_c := _prepaid_lock(p_card_id);
  v_staff := _require_staff(p_meta, v_c.shop_id, false);
  select * into v_p from prepaid_products where id = v_c.product_id;
  if p_kind = 'activate' and v_c.status = 'active' then
    perform _raise('E_PREPAID_ALREADY_ACTIVE', jsonb_build_object('short_code', v_c.short_code,
                   'activated_at', v_c.activated_at) || _staff_json(v_staff));
  end if;
  if p_kind = 'recharge' and v_c.status = 'pending' then
    perform _raise('E_PREPAID_NOT_ACTIVE', jsonb_build_object('short_code', v_c.short_code) || _staff_json(v_staff));
  end if;
  v_before := v_c.balance;
  update prepaid_cards set
    status = 'active',
    balance = balance + v_p.units,
    charged_units = balance + v_p.units,
    activated_at = coalesce(activated_at, now()),
    last_charged_at = now(),
    expires_at = _prepaid_expiry(v_p)
  where id = v_c.id
  returning * into v_c;
  insert into prepaid_events (card_id, shop_id, kind, quantity, balance_before, balance_after, staff_user_id)
  values (v_c.id, v_c.shop_id, p_kind, v_p.units, v_before, v_c.balance, v_staff.user_id);
  perform _audit(p_meta, v_c.shop_id, 'prepaid_' || p_kind, 'prepaid_card', v_c.id::text,
                 jsonb_build_object('balance', v_before),
                 jsonb_build_object('balance', v_c.balance, 'expires_at', v_c.expires_at),
                 'pagamento ricevuto fuori dall''app');
  return _prepaid_json(v_c, v_p) || jsonb_build_object('balance_before', v_before, 'quantity', v_p.units)
      || _staff_json(v_staff);
end;
$$;

create or replace function prepaid_activate(p_card_id uuid, p_meta jsonb)
returns jsonb language sql security definer set search_path = public
as $$ select _prepaid_charge(p_card_id, p_meta, 'activate'); $$;

create or replace function prepaid_recharge(p_card_id uuid, p_meta jsonb)
returns jsonb language sql security definer set search_path = public
as $$ select _prepaid_charge(p_card_id, p_meta, 'recharge'); $$;

-- Scala p_quantity unità: mai prima dell'attivazione, dopo la scadenza o sotto zero.
create or replace function prepaid_consume(p_card_id uuid, p_quantity int, p_meta jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_c prepaid_cards;
  v_p prepaid_products;
  v_staff staff;
  v_before int;
begin
  v_c := _prepaid_lock(p_card_id);
  v_staff := _require_staff(p_meta, v_c.shop_id, false);
  select * into v_p from prepaid_products where id = v_c.product_id;
  if p_quantity is null or p_quantity < 1 or p_quantity > 10000 then
    perform _raise('E_VALIDATION', jsonb_build_object('field', 'quantity', 'problem', 'da 1 a 10000'));
  end if;
  if v_c.status = 'pending' then
    perform _raise('E_PREPAID_NOT_ACTIVE', jsonb_build_object('short_code', v_c.short_code, 'product', v_p.name)
                   || _staff_json(v_staff));
  end if;
  if v_c.expires_at is not null and v_c.expires_at <= now() then
    perform _raise('E_PREPAID_EXPIRED', jsonb_build_object('short_code', v_c.short_code, 'product', v_p.name,
                   'expires_at', v_c.expires_at) || _staff_json(v_staff));
  end if;
  if v_c.balance < p_quantity then
    perform _raise('E_PREPAID_INSUFFICIENT', jsonb_build_object('short_code', v_c.short_code, 'product', v_p.name,
                   'balance', v_c.balance, 'quantity', p_quantity, 'unit_plural', v_p.unit_plural)
                   || _staff_json(v_staff));
  end if;
  v_before := v_c.balance;
  update prepaid_cards set balance = balance - p_quantity where id = v_c.id returning * into v_c;
  insert into prepaid_events (card_id, shop_id, kind, quantity, balance_before, balance_after, staff_user_id)
  values (v_c.id, v_c.shop_id, 'consume', p_quantity, v_before, v_c.balance, v_staff.user_id);
  perform _audit(p_meta, v_c.shop_id, 'prepaid_consume', 'prepaid_card', v_c.id::text,
                 jsonb_build_object('balance', v_before), jsonb_build_object('balance', v_c.balance));
  return _prepaid_json(v_c, v_p) || jsonb_build_object('balance_before', v_before, 'quantity', p_quantity)
      || _staff_json(v_staff);
end;
$$;

-- Annulla l'ultimo consumo: stesse regole dell'annullamento del timbro (5 minuti, stessa persona, ultimo).
create or replace function prepaid_undo(p_card_id uuid, p_meta jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_c prepaid_cards;
  v_p prepaid_products;
  v_staff staff;
  v_e prepaid_events;
  v_by text;
  v_before int;
begin
  v_c := _prepaid_lock(p_card_id);
  v_staff := _require_staff(p_meta, v_c.shop_id, false);
  select * into v_p from prepaid_products where id = v_c.product_id;
  select * into v_e from prepaid_events where card_id = v_c.id and undone_at is null order by id desc limit 1;
  if not found or v_e.kind <> 'consume' then
    perform _raise(case when found then 'E_UNDO_NOT_LAST' else 'E_NOTHING_TO_UNDO' end,
                   jsonb_build_object('short_code', v_c.short_code, 'later_kind', v_e.kind) || _staff_json(v_staff));
  end if;
  if v_e.staff_user_id is distinct from v_staff.user_id then
    select display_name into v_by from staff where user_id = v_e.staff_user_id and shop_id = v_c.shop_id;
    perform _raise('E_UNDO_OTHER_OPERATOR', jsonb_build_object('short_code', v_c.short_code,
                   'stamped_by', coalesce(v_by, 'un altro operatore')) || _staff_json(v_staff));
  end if;
  if v_e.created_at < now() - interval '5 minutes' then
    perform _raise('E_UNDO_EXPIRED', jsonb_build_object('short_code', v_c.short_code,
                   'minutes_ago', floor(extract(epoch from now() - v_e.created_at) / 60)) || _staff_json(v_staff));
  end if;
  v_before := v_c.balance;
  update prepaid_events set undone_at = now(), undone_by = v_staff.user_id where id = v_e.id;
  update prepaid_cards set balance = balance + v_e.quantity where id = v_c.id returning * into v_c;
  perform _audit(p_meta, v_c.shop_id, 'prepaid_undo', 'prepaid_card', v_c.id::text,
                 jsonb_build_object('balance', v_before),
                 jsonb_build_object('balance', v_c.balance, 'undone_event_id', v_e.id));
  return _prepaid_json(v_c, v_p) || jsonb_build_object('balance_before', v_before, 'quantity', v_e.quantity)
      || _staff_json(v_staff);
end;
$$;

-- Correzione del saldo (solo titolare, con motivo): nuovo saldo assoluto.
create or replace function prepaid_adjust(p_card_id uuid, p_balance int, p_reason text, p_meta jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_c prepaid_cards;
  v_p prepaid_products;
  v_staff staff;
  v_before int;
begin
  v_c := _prepaid_lock(p_card_id);
  v_staff := _require_staff(p_meta, v_c.shop_id, true);
  select * into v_p from prepaid_products where id = v_c.product_id;
  if v_c.status = 'pending' then
    perform _raise('E_PREPAID_NOT_ACTIVE', jsonb_build_object('short_code', v_c.short_code) || _staff_json(v_staff));
  end if;
  if p_balance is null or p_balance < 0 or p_balance > 100000 then
    perform _raise('E_VALIDATION', jsonb_build_object('field', 'balance', 'problem', 'da 0 a 100000'));
  end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then
    perform _raise('E_VALIDATION', jsonb_build_object('field', 'reason', 'problem', 'motivo obbligatorio'));
  end if;
  v_before := v_c.balance;
  update prepaid_cards set balance = p_balance, charged_units = greatest(charged_units, p_balance)
   where id = v_c.id returning * into v_c;
  insert into prepaid_events (card_id, shop_id, kind, quantity, balance_before, balance_after, staff_user_id)
  values (v_c.id, v_c.shop_id, 'adjust', p_balance - v_before, v_before, v_c.balance, v_staff.user_id);
  perform _audit(p_meta, v_c.shop_id, 'prepaid_adjust', 'prepaid_card', v_c.id::text,
                 jsonb_build_object('balance', v_before), jsonb_build_object('balance', v_c.balance), trim(p_reason));
  return _prepaid_json(v_c, v_p) || jsonb_build_object('balance_before', v_before, 'quantity', p_balance - v_before)
      || _staff_json(v_staff);
end;
$$;

-- Azione idempotente (header Idempotency-Key), come card_action per la carta fedeltà.
create or replace function prepaid_action(p_action text, p_card_id uuid, p_quantity int, p_meta jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key uuid;
  v_user uuid;
  v_shop uuid;
  v_row action_keys;
  v_res jsonb;
  v_action text := 'prepaid_' || p_action;
begin
  if p_action not in ('activate', 'consume', 'recharge', 'undo') then
    perform _raise('E_VALIDATION', jsonb_build_object('problem', format('azione %s sconosciuta', p_action)));
  end if;
  begin
    v_key := nullif(p_meta->>'idempotency_key', '')::uuid;
  exception when invalid_text_representation then
    perform _raise('E_VALIDATION', jsonb_build_object('problem', 'chiave di idempotenza non valida'));
  end;

  if v_key is not null then
    select shop_id into v_shop from prepaid_cards where id = p_card_id;
    if not found then
      perform _raise('E_CARD_NOT_FOUND', jsonb_build_object('card_id', p_card_id));
    end if;
    v_user := (p_meta->>'actor_id')::uuid;
    insert into action_keys (shop_id, key, user_id, action, customer_id)
    values (v_shop, v_key, v_user, v_action, p_card_id)
    on conflict (shop_id, key) do nothing;
    if not found then
      select * into v_row from action_keys where shop_id = v_shop and key = v_key;
      if v_row.action <> v_action or v_row.customer_id <> p_card_id or v_row.user_id <> v_user then
        perform _raise('E_VALIDATION', jsonb_build_object(
          'problem', 'chiave di idempotenza già usata per un''altra operazione'));
      end if;
      return v_row.response || jsonb_build_object('duplicate', true, 'original_at', v_row.created_at);
    end if;
  end if;

  v_res := case p_action
    when 'activate' then prepaid_activate(p_card_id, p_meta)
    when 'recharge' then prepaid_recharge(p_card_id, p_meta)
    when 'consume' then prepaid_consume(p_card_id, p_quantity, p_meta)
    else prepaid_undo(p_card_id, p_meta)
  end;

  if v_key is not null then
    update action_keys set response = v_res where shop_id = v_shop and key = v_key;
  end if;
  return v_res || jsonb_build_object('duplicate', false);
end;
$$;

-- ---------- sincronizzazione con Google ----------

create table prepaid_sync_state (
  card_id         uuid not null references prepaid_cards(id) on delete cascade,
  wallet          text not null check (wallet in ('google', 'apple')),
  shop_id         uuid not null references shops(id) on delete cascade,
  synced_balance  int,
  synced_state    text,
  synced_version  int,
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  last_error_at   timestamptz,
  last_error_code text,
  last_error      text,
  attempts        int not null default 0,
  request_id      text,
  updated_at      timestamptz not null default now(),
  primary key (card_id, wallet)
);
alter table prepaid_sync_state enable row level security;

-- coda dei tentativi: anche tessere (prepaid_object) e template delle tessere (prepaid_class)
alter table wallet_sync_failures
  add column prepaid_card_id    uuid references prepaid_cards(id) on delete cascade,
  add column prepaid_product_id uuid references prepaid_products(id) on delete cascade,
  drop constraint wallet_sync_failures_kind_check,
  drop constraint wallet_sync_failures_target;
alter table wallet_sync_failures
  add constraint wallet_sync_failures_kind_check
    check (kind in ('object', 'class', 'message', 'prepaid_object', 'prepaid_class')),
  add constraint wallet_sync_failures_target check (
    (kind = 'class') or (kind in ('object', 'message') and customer_id is not null)
    or (kind = 'prepaid_object' and prepaid_card_id is not null)
    or (kind = 'prepaid_class' and prepaid_product_id is not null));
drop index wallet_sync_failures_open_key;
create unique index wallet_sync_failures_open_key
  on wallet_sync_failures (kind, wallet, coalesce(prepaid_card_id, prepaid_product_id, customer_id, shop_id),
                           coalesce(payload->>'message_id', ''))
  where resolved_at is null and exhausted_at is null;

drop function wallet_sync_record(text, text, uuid, uuid, boolean, jsonb, text, text, text, jsonb);

-- Come prima (Fase 4), più le tessere: p_prepaid_card_id per prepaid_object, p_prepaid_product_id per prepaid_class.
create or replace function wallet_sync_record(
  p_kind text, p_wallet text, p_shop_id uuid, p_customer_id uuid,
  p_ok boolean, p_synced jsonb, p_error_code text, p_error text, p_request_id text, p_payload jsonb default '{}',
  p_prepaid_card_id uuid default null, p_prepaid_product_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  schedule constant int[] := array[1, 5, 15, 60];
  v_target uuid := coalesce(p_prepaid_card_id, p_prepaid_product_id, p_customer_id, p_shop_id);
  v_msg text := coalesce(p_payload->>'message_id', '');
  v_fail wallet_sync_failures;
  v_attempt int;
  v_next timestamptz;
begin
  if p_kind = 'object' then
    insert into wallet_sync_state as s (customer_id, wallet, shop_id, last_attempt_at, request_id,
                                        synced_stamps, synced_rewards, synced_state, synced_version,
                                        last_success_at, last_error_at, last_error_code, last_error, attempts, updated_at)
    values (p_customer_id, p_wallet, p_shop_id, now(), p_request_id,
            case when p_ok then (p_synced->>'stamps')::int end,
            case when p_ok then (p_synced->>'rewards')::int end,
            case when p_ok then p_synced->>'state' end,
            case when p_ok then (p_synced->>'version')::int end,
            case when p_ok then now() end,
            case when not p_ok then now() end,
            case when not p_ok then p_error_code end,
            case when not p_ok then left(p_error, 1000) end,
            case when p_ok then 0 else 1 end, now())
    on conflict (customer_id, wallet) do update set
      last_attempt_at = now(),
      request_id      = p_request_id,
      synced_stamps   = case when p_ok then (p_synced->>'stamps')::int else s.synced_stamps end,
      synced_rewards  = case when p_ok then (p_synced->>'rewards')::int else s.synced_rewards end,
      synced_state    = case when p_ok then p_synced->>'state' else s.synced_state end,
      synced_version  = case when p_ok then (p_synced->>'version')::int else s.synced_version end,
      last_success_at = case when p_ok then now() else s.last_success_at end,
      last_error_at   = case when p_ok then s.last_error_at else now() end,
      last_error_code = case when p_ok then s.last_error_code else p_error_code end,
      last_error      = case when p_ok then s.last_error else left(p_error, 1000) end,
      attempts        = case when p_ok then 0 else s.attempts + 1 end,
      updated_at      = now();
  elsif p_kind = 'prepaid_object' then
    insert into prepaid_sync_state as s (card_id, wallet, shop_id, last_attempt_at, request_id,
                                         synced_balance, synced_state, synced_version,
                                         last_success_at, last_error_at, last_error_code, last_error, attempts, updated_at)
    values (p_prepaid_card_id, p_wallet, p_shop_id, now(), p_request_id,
            case when p_ok then (p_synced->>'balance')::int end,
            case when p_ok then p_synced->>'state' end,
            case when p_ok then (p_synced->>'version')::int end,
            case when p_ok then now() end,
            case when not p_ok then now() end,
            case when not p_ok then p_error_code end,
            case when not p_ok then left(p_error, 1000) end,
            case when p_ok then 0 else 1 end, now())
    on conflict (card_id, wallet) do update set
      last_attempt_at = now(),
      request_id      = p_request_id,
      synced_balance  = case when p_ok then (p_synced->>'balance')::int else s.synced_balance end,
      synced_state    = case when p_ok then p_synced->>'state' else s.synced_state end,
      synced_version  = case when p_ok then (p_synced->>'version')::int else s.synced_version end,
      last_success_at = case when p_ok then now() else s.last_success_at end,
      last_error_at   = case when p_ok then s.last_error_at else now() end,
      last_error_code = case when p_ok then s.last_error_code else p_error_code end,
      last_error      = case when p_ok then s.last_error else left(p_error, 1000) end,
      attempts        = case when p_ok then 0 else s.attempts + 1 end,
      updated_at      = now();
  end if;

  select * into v_fail
    from wallet_sync_failures
   where kind = p_kind and wallet = p_wallet
     and coalesce(prepaid_card_id, prepaid_product_id, customer_id, shop_id) = v_target
     and coalesce(payload->>'message_id', '') = v_msg and resolved_at is null and exhausted_at is null
   for update;

  if p_ok then
    if found then
      update wallet_sync_failures set resolved_at = now(), updated_at = now() where id = v_fail.id;
    end if;
    return jsonb_build_object('resolved_after_attempts', case when found then v_fail.attempt end);
  end if;

  v_attempt := case when found then v_fail.attempt + 1 else 1 end;
  v_next := case when v_attempt <= array_length(schedule, 1) then now() + make_interval(mins => schedule[v_attempt]) end;

  if found then
    update wallet_sync_failures
       set attempt = v_attempt, error_code = p_error_code, error = left(p_error, 1000), request_id = p_request_id,
           next_retry_at = v_next, exhausted_at = case when v_next is null then now() end, updated_at = now()
     where id = v_fail.id;
  else
    insert into wallet_sync_failures (customer_id, wallet, shop_id, request_id, error_code, error, attempt,
                                      next_retry_at, kind, payload, prepaid_card_id, prepaid_product_id)
    values (p_customer_id, p_wallet, p_shop_id, p_request_id, p_error_code, left(p_error, 1000), 1,
            v_next, p_kind, p_payload, p_prepaid_card_id, p_prepaid_product_id);
  end if;

  return jsonb_build_object('attempt', v_attempt, 'next_retry_at', v_next,
                            'retry_in_min', case when v_next is not null then schedule[v_attempt] end,
                            'exhausted', v_next is null);
end;
$$;

-- Stato che Google deve mostrare: la tessera è ACTIVE solo se il cliente e il negozio esistono e sono attivi.
create or replace function _prepaid_google_state(p_c prepaid_cards, p_s shops)
returns text
language sql
stable
as $$
  select case when p_c.deleted_at is null and p_s.status = 'active' then 'ACTIVE' else 'INACTIVE' end;
$$;

-- Tessere non allineate su Google (saldo, stato, versione del tipo di tessera) da più di 2 minuti.
create or replace function prepaid_sync_drifted(p_limit int)
returns table (card_id uuid, shop_id uuid, reason text)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.shop_id,
         case
           when s.card_id is null then 'mai sincronizzata'
           when s.synced_state is distinct from (_prepaid_google_state(c, sh) || ':' || _prepaid_state(c)) then 'stato'
           when s.synced_version is distinct from p.card_version + sh.card_version then 'impostazioni'
           else 'saldo'
         end
    from prepaid_cards c
    join prepaid_products p on p.id = c.product_id
    join shops sh on sh.id = c.shop_id
    left join prepaid_sync_state s on s.card_id = c.id and s.wallet = 'google'
   where c.created_at < now() - interval '2 minutes'
     and (s.last_attempt_at is null or s.last_attempt_at < now() - interval '2 minutes')
     and (
       s.card_id is null
       or s.synced_balance is distinct from c.balance
       or s.synced_state is distinct from (_prepaid_google_state(c, sh) || ':' || _prepaid_state(c))
       or s.synced_version is distinct from p.card_version + sh.card_version
     )
     and not exists (
       select 1 from wallet_sync_failures f
        where f.prepaid_card_id = c.id and f.kind = 'prepaid_object' and f.resolved_at is null and f.exhausted_at is null)
     and not (c.deleted_at is not null and s.card_id is null)
   order by c.created_at
   limit p_limit;
$$;

-- La carta fedeltà va su Google solo se il negozio la offre (loyalty_enabled).
create or replace function wallet_sync_drifted(p_limit int)
returns table (customer_id uuid, shop_id uuid, reason text)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.shop_id,
         case
           when s.customer_id is null then 'mai sincronizzata'
           when s.synced_state is distinct from (case when c.deleted_at is null and sh.status = 'active' then 'ACTIVE' else 'INACTIVE' end) then 'stato'
           when s.synced_version is distinct from sh.card_version then 'impostazioni del negozio'
           else 'saldo'
         end
    from customers c
    join shops sh on sh.id = c.shop_id
    left join wallet_sync_state s on s.customer_id = c.id and s.wallet = 'google'
   where c.created_at < now() - interval '2 minutes'
     and sh.loyalty_enabled
     and (s.last_attempt_at is null or s.last_attempt_at < now() - interval '2 minutes')
     and (
       s.customer_id is null
       or s.synced_stamps is distinct from c.stamps
       or s.synced_rewards is distinct from c.rewards_available
       or s.synced_state is distinct from (case when c.deleted_at is null and sh.status = 'active' then 'ACTIVE' else 'INACTIVE' end)
       or s.synced_version is distinct from sh.card_version
     )
     and not exists (
       select 1 from wallet_sync_failures f
        where f.customer_id = c.id and f.kind = 'object' and f.resolved_at is null and f.exhausted_at is null)
     and not (c.deleted_at is not null and s.customer_id is null)
   order by c.created_at
   limit p_limit;
$$;

-- ---------- GDPR: cancellazione ed esportazione comprendono le tessere ----------

create or replace function delete_customer(p_customer_id uuid, p_reason text, p_meta jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_c customers;
  v_s shops;
  v_extra jsonb := '{}';
  v_rows int;
  v_cards int;
begin
  select * into v_c from customers where id = p_customer_id for update;
  if not found then
    perform _raise('E_CARD_NOT_FOUND', jsonb_build_object('customer_id', p_customer_id));
  end if;
  select * into v_s from shops where id = v_c.shop_id;
  if coalesce(p_meta->>'actor_type', '') = 'support' then
    perform _require_support(p_meta);
    v_extra := jsonb_build_object('staff_name', 'assistenza', 'staff_role', 'support');
  else
    v_extra := _staff_json(_require_staff(p_meta, v_s.id, true));
  end if;
  perform _ensure_not_deleted(v_c);

  update customers
     set name = 'Cliente cancellato', phone = null, phone_hash = null, consent_privacy = false,
         consent_marketing = false, deleted_at = now()
   where id = v_c.id;
  -- le tessere del cliente seguono la persona: disattivate su Google dal cron
  update prepaid_cards set deleted_at = now() where customer_id = v_c.id and deleted_at is null;
  get diagnostics v_cards = row_count;

  perform set_config('app.audit_pseudonymize', 'on', true);
  update audit_log
     set before = before - array['name', 'phone'],
         after  = after  - array['name', 'phone']
   where entity = 'customer' and entity_id = v_c.id::text;
  get diagnostics v_rows = row_count;
  perform set_config('app.audit_pseudonymize', 'off', true);

  perform _audit(p_meta, v_s.id, 'customer_delete', 'customer', v_c.id::text,
                 jsonb_build_object('stamps', v_c.stamps, 'rewards_available', v_c.rewards_available,
                                    'consent_marketing', v_c.consent_marketing),
                 jsonb_build_object('deleted', true, 'audit_rows_pseudonymized', v_rows, 'prepaid_cards_deleted', v_cards),
                 nullif(trim(coalesce(p_reason, '')), ''));

  return _card_json(v_c, v_s)
      || jsonb_build_object('deleted', true, 'audit_rows_pseudonymized', v_rows, 'prepaid_cards_deleted', v_cards)
      || v_extra;
end;
$$;

create or replace function support_customer_export(p_customer_id uuid, p_meta jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_c customers;
  v_s shops;
  v_out jsonb;
begin
  perform _require_support(p_meta);
  select * into v_c from customers where id = p_customer_id;
  if not found then
    perform _raise('E_CARD_NOT_FOUND', jsonb_build_object('customer_id', p_customer_id));
  end if;
  select * into v_s from shops where id = v_c.shop_id;

  v_out := jsonb_build_object(
    'negozio', jsonb_build_object('nome', v_s.name, 'titolare_del_trattamento', v_s.legal_name,
                                  'partita_iva', v_s.vat_number, 'contatto_privacy', v_s.privacy_email),
    'cliente', jsonb_build_object('nome', v_c.name, 'telefono', v_c.phone, 'codice_carta', v_c.short_code,
                                  'iscritto_il', v_c.created_at, 'cancellato_il', v_c.deleted_at),
    'consensi', jsonb_build_object('privacy', v_c.consent_privacy, 'promozioni', v_c.consent_marketing),
    'saldo', jsonb_build_object('timbri', v_c.stamps, 'timbri_per_premio', v_s.stamps_required,
                                'premi_disponibili', v_c.rewards_available),
    'storico', coalesce((
      select jsonb_agg(jsonb_build_object('quando', e.created_at, 'tipo', e.kind,
                                          'annullato_il', e.undone_at) order by e.created_at)
        from stamp_events e where e.customer_id = v_c.id), '[]'),
    'tessere', coalesce((
      select jsonb_agg(jsonb_build_object(
               'tessera', p.name, 'codice', t.short_code, 'stato', _prepaid_state(t), 'saldo', t.balance,
               'unita', p.unit_plural, 'attivata_il', t.activated_at, 'scadenza', t.expires_at,
               'movimenti', coalesce((
                 select jsonb_agg(jsonb_build_object('quando', e.created_at, 'tipo', e.kind, 'quantita', e.quantity,
                                                     'saldo_dopo', e.balance_after, 'annullato_il', e.undone_at)
                                  order by e.created_at)
                   from prepaid_events e where e.card_id = t.id), '[]'))
             order by t.created_at)
        from prepaid_cards t join prepaid_products p on p.id = t.product_id
       where t.customer_id = v_c.id), '[]'),
    'modifiche_registrate', coalesce((
      select jsonb_agg(jsonb_build_object('quando', a.ts, 'azione', a.action, 'prima', a.before,
                                          'dopo', a.after, 'motivo', a.reason) order by a.ts)
        from audit_log a
       where (a.entity = 'customer' and a.entity_id = v_c.id::text)
          or (a.entity = 'prepaid_card' and a.entity_id in (select id::text from prepaid_cards where customer_id = v_c.id))), '[]'),
    'carta_nei_wallet', coalesce((
      select jsonb_agg(jsonb_build_object('wallet', w.wallet, 'ultimo_aggiornamento', w.last_success_at,
                                          'stato', w.synced_state))
        from wallet_sync_state w where w.customer_id = v_c.id), '[]'),
    'promozioni_ricevute', coalesce((
      select jsonb_agg(jsonb_build_object('quando', p.created_at, 'testo', p.body) order by p.created_at)
        from promotion_deliveries d join promotions p on p.id = d.promotion_id
       where d.customer_id = v_c.id and d.status = 'sent'), '[]')
  );

  perform _audit(p_meta, v_s.id, 'customer_export', 'customer', v_c.id::text, null,
                 jsonb_build_object('sections', (select jsonb_agg(k) from jsonb_object_keys(v_out) k)),
                 nullif(trim(coalesce(p_meta->>'reason', '')), ''));
  return v_out || jsonb_build_object('_meta', jsonb_build_object('short_code', v_c.short_code, 'shop_name', v_s.name));
end;
$$;

-- ---------- interruttore della carta fedeltà (titolare) ----------

create or replace function set_loyalty_enabled(p_shop_id uuid, p_enabled boolean, p_meta jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff staff;
  v_s shops;
begin
  v_staff := _require_staff(p_meta, p_shop_id, true);
  select * into v_s from shops where id = p_shop_id for update;
  if v_s.loyalty_enabled = p_enabled then
    return jsonb_build_object('changed', false, 'loyalty_enabled', p_enabled) || _staff_json(v_staff);
  end if;
  update shops set loyalty_enabled = p_enabled where id = p_shop_id;
  perform _audit(p_meta, p_shop_id, 'settings_update', 'shop', p_shop_id::text,
                 jsonb_build_object('loyalty_enabled', v_s.loyalty_enabled), jsonb_build_object('loyalty_enabled', p_enabled));
  return jsonb_build_object('changed', true, 'loyalty_enabled', p_enabled) || _staff_json(v_staff);
end;
$$;

-- ---------- permessi: solo il backend (service role) ----------

revoke all on function _prepaid_state(prepaid_cards) from public, anon, authenticated;
revoke all on function _prepaid_json(prepaid_cards, prepaid_products) from public, anon, authenticated;
revoke all on function _prepaid_lock(uuid) from public, anon, authenticated;
revoke all on function _prepaid_expiry(prepaid_products) from public, anon, authenticated;
revoke all on function _prepaid_charge(uuid, jsonb, text) from public, anon, authenticated;
revoke all on function _prepaid_google_state(prepaid_cards, shops) from public, anon, authenticated;
revoke all on function prepaid_product_save(uuid, uuid, jsonb, jsonb) from public, anon, authenticated;
revoke all on function prepaid_enroll(uuid, text, text, boolean, boolean, jsonb) from public, anon, authenticated;
revoke all on function prepaid_activate(uuid, jsonb) from public, anon, authenticated;
revoke all on function prepaid_recharge(uuid, jsonb) from public, anon, authenticated;
revoke all on function prepaid_consume(uuid, int, jsonb) from public, anon, authenticated;
revoke all on function prepaid_undo(uuid, jsonb) from public, anon, authenticated;
revoke all on function prepaid_adjust(uuid, int, text, jsonb) from public, anon, authenticated;
revoke all on function prepaid_action(text, uuid, int, jsonb) from public, anon, authenticated;
revoke all on function wallet_sync_record(text, text, uuid, uuid, boolean, jsonb, text, text, text, jsonb, uuid, uuid) from public, anon, authenticated;
revoke all on function prepaid_sync_drifted(int) from public, anon, authenticated;
revoke all on function wallet_sync_drifted(int) from public, anon, authenticated;
revoke all on function delete_customer(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function support_customer_export(uuid, jsonb) from public, anon, authenticated;
revoke all on function set_loyalty_enabled(uuid, boolean, jsonb) from public, anon, authenticated;
