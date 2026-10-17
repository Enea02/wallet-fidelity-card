-- =============================================================
-- Fase 9.6 — punti con livelli, membership e abbonamenti.
--   Punti: la carta fedeltà del negozio è a timbri OPPURE a punti (loyalty_mode). In cassa lo
--   staff scrive l'importo dello scontrino: punti = importo × punti per euro, per difetto, solo
--   sopra la spesa minima. Il livello si calcola sui punti totali (non si perdono). Funzioni
--   atomiche con audit, idempotenza (action_keys), annullamento entro 5 minuti.
--   Abbonamenti: secondo tipo di tessera prepagata (kind = abbonamento) con vantaggio e durata;
--   attivazione e rinnovo in cassa dopo il pagamento (fuori app), nessuno scalo.
-- =============================================================

-- ---------- impostazioni dei punti ----------

alter table shops
  add column loyalty_mode text not null default 'timbri' check (loyalty_mode in ('timbri', 'punti')),
  add column points_per_euro int not null default 1 check (points_per_euro between 1 and 100),
  -- spesa minima (centesimi) perché uno scontrino dia punti
  add column points_min_cents int not null default 0 check (points_min_cents between 0 and 100000),
  -- [{ "name": "Silver", "min": 0, "perk": "" }, ...] ordinati per soglia, il primo da 0
  add column points_levels jsonb not null default '[{"name":"Silver","min":0,"perk":""},{"name":"Gold","min":500,"perk":""},{"name":"Platinum","min":1500,"perk":""}]';

alter table customers
  add column points int not null default 0 check (points >= 0),
  add column points_total int not null default 0 check (points_total >= 0),
  -- livello attuale (per accorgersi del cambio e notificarlo una volta sola)
  add column points_level text;

create table points_events (
  id            bigint generated always as identity primary key,
  customer_id   uuid not null references customers(id) on delete cascade,
  shop_id       uuid not null references shops(id) on delete cascade,
  kind          text not null check (kind in ('add', 'adjust')),
  amount_cents  int,
  points        int not null,
  total_before  int not null,
  total_after   int not null,
  level_before  text,
  level_after   text,
  staff_user_id uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  undone_at     timestamptz,
  undone_by     uuid references auth.users(id) on delete set null
);
create index points_events_customer_idx on points_events (customer_id, id desc);
create index points_events_shop_idx on points_events (shop_id, created_at desc);
alter table points_events enable row level security;

alter table action_keys drop constraint action_keys_action_check;
alter table action_keys add constraint action_keys_action_check
  check (action in ('stamp', 'undo', 'redeem', 'prepaid_activate', 'prepaid_consume', 'prepaid_recharge',
                    'prepaid_undo', 'points_add', 'points_undo'));

-- Livello per i punti totali: quello con la soglia più alta raggiunta.
create or replace function _points_level(p_levels jsonb, p_total int)
returns text
language sql
immutable
as $$
  select l->>'name'
    from jsonb_array_elements(p_levels) l
   where (l->>'min')::int <= p_total
   order by (l->>'min')::int desc
   limit 1;
$$;

create or replace function _points_json(p_c customers, p_s shops)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'customer_id', p_c.id, 'short_code', p_c.short_code, 'points', p_c.points, 'points_total', p_c.points_total,
    'level', _points_level(p_s.points_levels, p_c.points_total), 'deleted', p_c.deleted_at is not null
  );
$$;

-- Carta a punti bloccata per l'operazione, con i controlli comuni (staff, negozio attivo, modalità punti).
create or replace function _points_lock(p_customer_id uuid, p_meta jsonb, p_owner_only boolean)
returns customers
language plpgsql
set search_path = public
as $$
declare
  v_c customers;
  v_s shops;
  v_staff staff;
begin
  select * into v_c from customers where id = p_customer_id for update;
  if not found then
    perform _raise('E_CARD_NOT_FOUND', jsonb_build_object('customer_id', p_customer_id));
  end if;
  select * into v_s from shops where id = v_c.shop_id;
  v_staff := _require_staff(p_meta, v_s.id, p_owner_only);
  perform _ensure_not_deleted(v_c);
  if v_s.status <> 'active' then
    perform _raise('E_SHOP_SUSPENDED', jsonb_build_object('shop_id', v_s.id));
  end if;
  if v_s.loyalty_mode <> 'punti' then
    perform _raise('E_POINTS_MODE_REQUIRED', jsonb_build_object('shop_id', v_s.id) || _staff_json(v_staff));
  end if;
  return v_c;
end;
$$;

-- ---------- punti in cassa ----------

create or replace function add_points(p_customer_id uuid, p_amount_cents int, p_meta jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_c customers;
  v_s shops;
  v_staff staff;
  v_points int;
  v_before text;
  v_after text;
  v_total_before int;
  v_event bigint;
begin
  v_c := _points_lock(p_customer_id, p_meta, false);
  select * into v_s from shops where id = v_c.shop_id;
  v_staff := _require_staff(p_meta, v_s.id, false);
  if p_amount_cents is null or p_amount_cents < 1 or p_amount_cents > 1000000 then
    perform _raise('E_POINTS_AMOUNT_INVALID', jsonb_build_object('amount_cents', p_amount_cents) || _staff_json(v_staff));
  end if;
  v_points := case when p_amount_cents < v_s.points_min_cents then 0
                   else floor(p_amount_cents * v_s.points_per_euro / 100.0)::int end;
  v_total_before := v_c.points_total;
  v_before := _points_level(v_s.points_levels, v_c.points_total);
  update customers set points = points + v_points, points_total = points_total + v_points
   where id = v_c.id returning * into v_c;
  v_after := _points_level(v_s.points_levels, v_c.points_total);
  update customers set points_level = v_after where id = v_c.id;
  insert into points_events (customer_id, shop_id, kind, amount_cents, points, total_before, total_after,
                             level_before, level_after, staff_user_id)
  values (v_c.id, v_s.id, 'add', p_amount_cents, v_points, v_total_before, v_c.points_total, v_before, v_after,
          v_staff.user_id)
  returning id into v_event;
  perform _audit(p_meta, v_s.id, 'points_add', 'customer', v_c.id::text,
                 jsonb_build_object('points', v_c.points - v_points, 'level', v_before),
                 jsonb_build_object('points', v_c.points, 'level', v_after, 'amount_cents', p_amount_cents));
  return _points_json(v_c, v_s) || jsonb_build_object(
    'points_added', v_points, 'amount_cents', p_amount_cents, 'level_before', v_before, 'level_after', v_after,
    'level_changed', v_before is distinct from v_after, 'points_event_id', v_event) || _staff_json(v_staff);
end;
$$;

-- Annulla gli ultimi punti dati: 5 minuti, stessa persona, ultima operazione della carta.
create or replace function undo_last_points(p_customer_id uuid, p_meta jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_c customers;
  v_s shops;
  v_staff staff;
  v_e points_events;
  v_by text;
  v_after text;
begin
  v_c := _points_lock(p_customer_id, p_meta, false);
  select * into v_s from shops where id = v_c.shop_id;
  v_staff := _require_staff(p_meta, v_s.id, false);
  select * into v_e from points_events where customer_id = v_c.id and undone_at is null order by id desc limit 1;
  if not found or v_e.kind <> 'add' then
    perform _raise(case when found then 'E_UNDO_NOT_LAST' else 'E_NOTHING_TO_UNDO' end,
                   jsonb_build_object('short_code', v_c.short_code, 'later_kind', v_e.kind) || _staff_json(v_staff));
  end if;
  if v_e.staff_user_id is distinct from v_staff.user_id then
    select display_name into v_by from staff where user_id = v_e.staff_user_id and shop_id = v_s.id;
    perform _raise('E_UNDO_OTHER_OPERATOR', jsonb_build_object('short_code', v_c.short_code,
                   'stamped_by', coalesce(v_by, 'un altro operatore')) || _staff_json(v_staff));
  end if;
  if v_e.created_at < now() - interval '5 minutes' then
    perform _raise('E_UNDO_EXPIRED', jsonb_build_object('short_code', v_c.short_code,
                   'minutes_ago', floor(extract(epoch from now() - v_e.created_at) / 60)) || _staff_json(v_staff));
  end if;
  update points_events set undone_at = now(), undone_by = v_staff.user_id where id = v_e.id;
  update customers set points = greatest(0, points - v_e.points), points_total = greatest(0, points_total - v_e.points)
   where id = v_c.id returning * into v_c;
  v_after := _points_level(v_s.points_levels, v_c.points_total);
  update customers set points_level = v_after where id = v_c.id;
  perform _audit(p_meta, v_s.id, 'points_undo', 'customer', v_c.id::text,
                 jsonb_build_object('points', v_c.points + v_e.points), jsonb_build_object('points', v_c.points,
                 'level', v_after, 'undone_points_event_id', v_e.id));
  return _points_json(v_c, v_s) || jsonb_build_object('points_removed', v_e.points) || _staff_json(v_staff);
end;
$$;

-- Correzione del titolare (con motivo): nuovo saldo; i punti totali cambiano della stessa differenza.
create or replace function adjust_points(p_customer_id uuid, p_points int, p_reason text, p_meta jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_c customers;
  v_s shops;
  v_staff staff;
  v_before int;
  v_total_before int;
  v_lvl_before text;
  v_after text;
begin
  v_c := _points_lock(p_customer_id, p_meta, true);
  select * into v_s from shops where id = v_c.shop_id;
  v_staff := _require_staff(p_meta, v_s.id, true);
  if p_points is null or p_points < 0 or p_points > 10000000 then
    perform _raise('E_VALIDATION', jsonb_build_object('field', 'points', 'problem', 'da 0 a 10000000'));
  end if;
  if length(trim(coalesce(p_reason, ''))) < 5 then
    perform _raise('E_VALIDATION', jsonb_build_object('field', 'reason', 'problem', 'motivo obbligatorio'));
  end if;
  v_before := v_c.points;
  v_total_before := v_c.points_total;
  v_lvl_before := _points_level(v_s.points_levels, v_c.points_total);
  update customers set points = p_points, points_total = greatest(0, points_total + (p_points - v_before))
   where id = v_c.id returning * into v_c;
  v_after := _points_level(v_s.points_levels, v_c.points_total);
  update customers set points_level = v_after where id = v_c.id;
  insert into points_events (customer_id, shop_id, kind, points, total_before, total_after, level_before, level_after,
                             staff_user_id)
  values (v_c.id, v_s.id, 'adjust', p_points - v_before, v_total_before, v_c.points_total, v_lvl_before, v_after,
          v_staff.user_id);
  perform _audit(p_meta, v_s.id, 'points_adjust', 'customer', v_c.id::text,
                 jsonb_build_object('points', v_before, 'level', v_lvl_before),
                 jsonb_build_object('points', p_points, 'level', v_after), trim(p_reason));
  return _points_json(v_c, v_s) || jsonb_build_object('points_before', v_before, 'level_before', v_lvl_before,
                                                      'level_after', v_after) || _staff_json(v_staff);
end;
$$;

-- Azione idempotente in cassa (header Idempotency-Key), come card_action.
create or replace function points_action(p_action text, p_customer_id uuid, p_amount_cents int, p_meta jsonb)
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
  v_action text := 'points_' || p_action;
begin
  if p_action not in ('add', 'undo') then
    perform _raise('E_VALIDATION', jsonb_build_object('problem', format('azione %s sconosciuta', p_action)));
  end if;
  begin
    v_key := nullif(p_meta->>'idempotency_key', '')::uuid;
  exception when invalid_text_representation then
    perform _raise('E_VALIDATION', jsonb_build_object('problem', 'chiave di idempotenza non valida'));
  end;
  if v_key is not null then
    select shop_id into v_shop from customers where id = p_customer_id;
    if not found then
      perform _raise('E_CARD_NOT_FOUND', jsonb_build_object('customer_id', p_customer_id));
    end if;
    v_user := (p_meta->>'actor_id')::uuid;
    insert into action_keys (shop_id, key, user_id, action, customer_id)
    values (v_shop, v_key, v_user, v_action, p_customer_id)
    on conflict (shop_id, key) do nothing;
    if not found then
      select * into v_row from action_keys where shop_id = v_shop and key = v_key;
      if v_row.action <> v_action or v_row.customer_id <> p_customer_id or v_row.user_id <> v_user then
        perform _raise('E_VALIDATION', jsonb_build_object(
          'problem', 'chiave di idempotenza già usata per un''altra operazione'));
      end if;
      return v_row.response || jsonb_build_object('duplicate', true, 'original_at', v_row.created_at);
    end if;
  end if;
  v_res := case p_action when 'add' then add_points(p_customer_id, p_amount_cents, p_meta)
                         else undo_last_points(p_customer_id, p_meta) end;
  if v_key is not null then
    update action_keys set response = v_res where shop_id = v_shop and key = v_key;
  end if;
  return v_res || jsonb_build_object('duplicate', false);
end;
$$;

-- Impostazioni dei punti (titolare): modalità, punti per euro, spesa minima, livelli.
-- Cambiare modalità o livelli cambia la carta: card_version sale e i livelli si ricalcolano (senza notifiche).
create or replace function update_points_settings(p_shop_id uuid, p_fields jsonb, p_meta jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff staff;
  v_old shops;
  v_new shops;
  v_levels jsonb := p_fields->'levels';
  v_prev int := -1;
  l jsonb;
begin
  v_staff := _require_staff(p_meta, p_shop_id, true);
  select * into v_old from shops where id = p_shop_id for update;
  if v_levels is not null then
    if jsonb_typeof(v_levels) <> 'array' or jsonb_array_length(v_levels) not between 1 and 5 then
      perform _raise('E_VALIDATION', jsonb_build_object('field', 'levels', 'problem', 'da 1 a 5 livelli'));
    end if;
    for l in select * from jsonb_array_elements(v_levels) loop
      if length(trim(coalesce(l->>'name', ''))) not between 2 and 20 or (l->>'min')::int <= v_prev
         or length(coalesce(l->>'perk', '')) > 80 then
        perform _raise('E_VALIDATION', jsonb_build_object('field', 'levels',
          'problem', 'nomi da 2 a 20 caratteri, soglie crescenti, vantaggio fino a 80 caratteri'));
      end if;
      v_prev := (l->>'min')::int;
    end loop;
    if (v_levels->0->>'min')::int <> 0 then
      perform _raise('E_VALIDATION', jsonb_build_object('field', 'levels', 'problem', 'il primo livello parte da 0 punti'));
    end if;
  end if;
  update shops set
    loyalty_mode     = coalesce(p_fields->>'mode', loyalty_mode),
    points_per_euro  = coalesce((p_fields->>'points_per_euro')::int, points_per_euro),
    points_min_cents = coalesce((p_fields->>'min_cents')::int, points_min_cents),
    points_levels    = coalesce(v_levels, points_levels)
  where id = p_shop_id
  returning * into v_new;
  if (v_old.loyalty_mode, v_old.points_per_euro, v_old.points_min_cents, v_old.points_levels)
     is not distinct from (v_new.loyalty_mode, v_new.points_per_euro, v_new.points_min_cents, v_new.points_levels) then
    return jsonb_build_object('changed', false) || _staff_json(v_staff);
  end if;
  if (v_old.loyalty_mode, v_old.points_levels) is distinct from (v_new.loyalty_mode, v_new.points_levels) then
    update shops set card_version = card_version + 1 where id = p_shop_id;
    update customers set points_level = _points_level(v_new.points_levels, points_total)
     where shop_id = p_shop_id and deleted_at is null;
  end if;
  perform _audit(p_meta, p_shop_id, 'points_settings_update', 'shop', p_shop_id::text,
                 jsonb_build_object('mode', v_old.loyalty_mode, 'points_per_euro', v_old.points_per_euro,
                                    'min_cents', v_old.points_min_cents, 'levels', v_old.points_levels),
                 jsonb_build_object('mode', v_new.loyalty_mode, 'points_per_euro', v_new.points_per_euro,
                                    'min_cents', v_new.points_min_cents, 'levels', v_new.points_levels));
  return jsonb_build_object('changed', true,
    'before', jsonb_build_object('mode', v_old.loyalty_mode, 'points_per_euro', v_old.points_per_euro,
                                 'min_cents', v_old.points_min_cents, 'levels', v_old.points_levels),
    'after', jsonb_build_object('mode', v_new.loyalty_mode, 'points_per_euro', v_new.points_per_euro,
                                'min_cents', v_new.points_min_cents, 'levels', v_new.points_levels))
    || _staff_json(v_staff);
end;
$$;

-- Riallineamento su Google: per i negozi a punti il "saldo" sincronizzato sono i punti.
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
       or s.synced_stamps is distinct from (case when sh.loyalty_mode = 'punti' then c.points else c.stamps end)
       or s.synced_rewards is distinct from (case when sh.loyalty_mode = 'punti' then c.points_total else c.rewards_available end)
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

-- ---------- membership e abbonamenti (tipo di tessera) ----------

alter table prepaid_products
  add column kind text not null default 'consumo' check (kind in ('consumo', 'abbonamento')),
  -- vantaggio mostrato in cassa e nel wallet ("-10% su tutto", "accesso illimitato")
  add column benefit text check (benefit is null or length(trim(benefit)) between 2 and 80),
  alter column units drop not null,
  alter column unit_singular drop not null,
  alter column unit_plural drop not null;
alter table prepaid_products add constraint prepaid_products_kind_fields check (
  (kind = 'consumo' and units is not null and unit_singular is not null and unit_plural is not null)
  or (kind = 'abbonamento' and units is null and benefit is not null));

-- Stato: l'abbonamento non si esaurisce (non ha unità).
create or replace function _prepaid_state(p_c prepaid_cards)
returns text
language sql
stable
as $$
  select case
    when p_c.status = 'pending' then 'da_attivare'
    when p_c.expires_at is not null and p_c.expires_at <= now() then 'scaduta'
    when p_c.balance = 0 and not exists (
      select 1 from prepaid_products p where p.id = p_c.product_id and p.kind = 'abbonamento') then 'esaurita'
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
    'units', p_p.units, 'kind', p_p.kind, 'benefit', p_p.benefit, 'status', p_c.status, 'state', _prepaid_state(p_c),
    'balance', p_c.balance, 'charged_units', p_c.charged_units, 'activated_at', p_c.activated_at,
    'expires_at', p_c.expires_at, 'deleted', p_c.deleted_at is not null
  );
$$;

-- Attivazione e ricarica/rinnovo dopo il pagamento. Abbonamento: nessuna unità; il rinnovo allunga
-- dalla scadenza se ancora valida, altrimenti riparte da oggi; senza durata non si rinnova.
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
  v_expires_before timestamptz;
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
  v_expires_before := v_c.expires_at;

  if v_p.kind = 'abbonamento' then
    if p_kind = 'recharge' and v_p.validity_months is null then
      perform _raise('E_MEMBERSHIP_NOT_RENEWABLE', jsonb_build_object('short_code', v_c.short_code,
                     'product', v_p.name) || _staff_json(v_staff));
    end if;
    update prepaid_cards set
      status = 'active',
      activated_at = coalesce(activated_at, now()),
      last_charged_at = now(),
      expires_at = case when v_p.validity_months is null then null
                        else greatest(now(), coalesce(expires_at, now())) + make_interval(months => v_p.validity_months) end
    where id = v_c.id
    returning * into v_c;
  else
    update prepaid_cards set
      status = 'active',
      balance = balance + v_p.units,
      charged_units = balance + v_p.units,
      activated_at = coalesce(activated_at, now()),
      last_charged_at = now(),
      expires_at = _prepaid_expiry(v_p)
    where id = v_c.id
    returning * into v_c;
  end if;
  insert into prepaid_events (card_id, shop_id, kind, quantity, balance_before, balance_after, staff_user_id)
  values (v_c.id, v_c.shop_id, p_kind, coalesce(v_p.units, 0), v_before, v_c.balance, v_staff.user_id);
  perform _audit(p_meta, v_c.shop_id, 'prepaid_' || p_kind, 'prepaid_card', v_c.id::text,
                 jsonb_build_object('balance', v_before, 'expires_at', v_expires_before),
                 jsonb_build_object('balance', v_c.balance, 'expires_at', v_c.expires_at),
                 'pagamento ricevuto fuori dall''app');
  return _prepaid_json(v_c, v_p) || jsonb_build_object('balance_before', v_before, 'quantity', coalesce(v_p.units, 0),
                                                       'expires_before', v_expires_before)
      || _staff_json(v_staff);
end;
$$;

-- Lo scalo non vale per gli abbonamenti (non hanno unità).
create or replace function _prepaid_require_units(p_card_id uuid)
returns void
language plpgsql
set search_path = public
as $$
begin
  if exists (select 1 from prepaid_cards c join prepaid_products p on p.id = c.product_id
              where c.id = p_card_id and p.kind = 'abbonamento') then
    perform _raise('E_VALIDATION', jsonb_build_object('problem', 'un abbonamento non ha unità da scalare'));
  end if;
end;
$$;

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
  if p_action in ('consume', 'undo') then
    perform _prepaid_require_units(p_card_id);
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

-- Tipi di tessera: anche l'abbonamento (kind, benefit; nessuna unità).
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
  v_kind text := coalesce(p_fields->>'kind', 'consumo');
begin
  v_staff := _require_staff(p_meta, p_shop_id, true);
  if p_product_id is null then
    if exists (select 1 from prepaid_products where shop_id = p_shop_id and code = p_fields->>'code') then
      perform _raise('E_VALIDATION', jsonb_build_object('field', 'code', 'problem', 'indirizzo già usato da un''altra tessera'));
    end if;
    begin
      insert into prepaid_products (shop_id, code, name, kind, benefit, units, unit_singular, unit_plural,
                                    validity_months, active)
      values (p_shop_id, p_fields->>'code', trim(p_fields->>'name'), v_kind, nullif(trim(p_fields->>'benefit'), ''),
              case when v_kind = 'consumo' then (p_fields->>'units')::int end,
              case when v_kind = 'consumo' then trim(p_fields->>'unit_singular') end,
              case when v_kind = 'consumo' then trim(p_fields->>'unit_plural') end,
              nullif(p_fields->>'validity_months', '')::int, coalesce((p_fields->>'active')::boolean, true))
      returning * into v_new;
    exception when check_violation then
      perform _raise('E_VALIDATION', jsonb_build_object('field', 'product',
        'problem', 'tessera a consumo: unità obbligatorie; abbonamento: vantaggio obbligatorio'));
    end;
    perform _audit(p_meta, p_shop_id, 'prepaid_product_create', 'prepaid_product', v_new.id::text, null, to_jsonb(v_new));
    return to_jsonb(v_new) || jsonb_build_object('created', true, 'changes', '[]'::jsonb) || _staff_json(v_staff);
  end if;

  select * into v_old from prepaid_products where id = p_product_id and shop_id = p_shop_id for update;
  if not found then
    perform _raise('E_PREPAID_PRODUCT_NOT_FOUND', jsonb_build_object('product_id', p_product_id));
  end if;
  begin
    update prepaid_products set
      name            = coalesce(trim(p_fields->>'name'), name),
      benefit         = case when p_fields ? 'benefit' then nullif(trim(p_fields->>'benefit'), '') else benefit end,
      units           = case when kind = 'consumo' then coalesce((p_fields->>'units')::int, units) else units end,
      unit_singular   = case when kind = 'consumo' then coalesce(trim(p_fields->>'unit_singular'), unit_singular) else unit_singular end,
      unit_plural     = case when kind = 'consumo' then coalesce(trim(p_fields->>'unit_plural'), unit_plural) else unit_plural end,
      validity_months = case when p_fields ? 'validity_months' then nullif(p_fields->>'validity_months', '')::int
                             else validity_months end,
      active          = coalesce((p_fields->>'active')::boolean, active)
    where id = p_product_id
    returning * into v_new;
  exception when check_violation then
    perform _raise('E_VALIDATION', jsonb_build_object('field', 'product', 'problem', 'abbonamento: vantaggio obbligatorio'));
  end;
  v_visible := (v_old.name, v_old.unit_singular, v_old.unit_plural, v_old.benefit) is distinct from
               (v_new.name, v_new.unit_singular, v_new.unit_plural, v_new.benefit);
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

-- ---------- permessi ----------

revoke all on function _points_level(jsonb, int) from public, anon, authenticated;
revoke all on function _points_json(customers, shops) from public, anon, authenticated;
revoke all on function _points_lock(uuid, jsonb, boolean) from public, anon, authenticated;
revoke all on function add_points(uuid, int, jsonb) from public, anon, authenticated;
revoke all on function undo_last_points(uuid, jsonb) from public, anon, authenticated;
revoke all on function adjust_points(uuid, int, text, jsonb) from public, anon, authenticated;
revoke all on function points_action(text, uuid, int, jsonb) from public, anon, authenticated;
revoke all on function update_points_settings(uuid, jsonb, jsonb) from public, anon, authenticated;
revoke all on function wallet_sync_drifted(int) from public, anon, authenticated;
revoke all on function _prepaid_state(prepaid_cards) from public, anon, authenticated;
revoke all on function _prepaid_json(prepaid_cards, prepaid_products) from public, anon, authenticated;
revoke all on function _prepaid_charge(uuid, jsonb, text) from public, anon, authenticated;
revoke all on function _prepaid_require_units(uuid) from public, anon, authenticated;
revoke all on function prepaid_action(text, uuid, int, jsonb) from public, anon, authenticated;
revoke all on function prepaid_product_save(uuid, uuid, jsonb, jsonb) from public, anon, authenticated;
