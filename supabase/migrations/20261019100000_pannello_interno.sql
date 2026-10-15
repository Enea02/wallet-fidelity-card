-- =============================================================
-- Fase 9 — pannello interno e vista Assistenza.
--   - support_members: il nostro team (login con 2FA, actor_type support);
--   - log_events: copia in Postgres dei log tecnici per la timeline
--     (30 giorni, 7 per le righe di modalità diagnostica);
--   - customers.phone_hash: ricerca per telefono senza telefono in chiaro;
--   - funzioni dell'assistenza: negozi, stato, dati per l'informativa,
--     esportazione GDPR, tracce di risincronizzazione e diagnostica.
-- Ogni azione dell'assistenza scrive audit_log con actor_type = support.
-- =============================================================

-- ---------- team interno ----------

create table support_members (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (length(trim(display_name)) between 2 and 60),
  email        text not null,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  created_by   text not null
);
alter table support_members enable row level security;

-- ---------- log tecnici per la timeline ----------

create table log_events (
  id            bigint generated always as identity primary key,
  ts            timestamptz not null,
  level         text not null check (level in ('trace', 'debug', 'info', 'warn', 'error')),
  event         text not null,
  msg           text not null,
  request_id    text,
  shop_id       uuid,
  user_id       uuid,
  customer_ref  text,
  enrollment_id text,
  error_code    text,
  platform      text,
  -- riga scritta solo perché era attiva la modalità diagnostica (debug/trace): tenuta 7 giorni
  diagnostic    boolean not null default false,
  -- la riga completa, già redatta dal logger
  fields        jsonb not null default '{}'
);
create index log_events_request_idx on log_events (request_id) where request_id is not null;
create index log_events_shop_idx on log_events (shop_id, ts desc) where shop_id is not null;
create index log_events_customer_idx on log_events (customer_ref, ts desc) where customer_ref is not null;
create index log_events_user_idx on log_events (user_id, ts desc) where user_id is not null;
create index log_events_error_idx on log_events (error_code, ts desc) where error_code is not null;
create index log_events_ts_idx on log_events (ts);
alter table log_events enable row level security;

-- Retention: a lotti, chiamata dal cron. Restituisce le righe tolte.
create or replace function purge_log_events(p_limit int default 5000)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old int;
  v_diag int;
begin
  with gone as (
    delete from log_events where id in (
      select id from log_events where ts < now() - interval '30 days' order by ts limit p_limit)
    returning 1)
  select count(*) into v_old from gone;
  with gone as (
    delete from log_events where id in (
      select id from log_events where diagnostic and ts < now() - interval '7 days' order by ts limit p_limit)
    returning 1)
  select count(*) into v_diag from gone;
  return jsonb_build_object('expired', v_old, 'diagnostic', v_diag);
end;
$$;

-- ---------- telefono cercabile per hash ----------

alter table customers add column phone_hash text;
create index customers_phone_hash_idx on customers (phone_hash) where phone_hash is not null;

-- Iscrizione completata: la carta eredita l'hash del telefono dalla sessione di iscrizione.
create or replace function enrollment_complete(p_id uuid, p_customer_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update customers c
     set phone_hash = s.phone_hash
    from enrollment_sessions s
   where s.id = p_id and c.id = p_customer_id and c.phone_hash is distinct from s.phone_hash;
  update enrollment_sessions
     set status = 'verified', customer_id = p_customer_id, phone = null, name = null
   where id = p_id;
$$;

-- Hash calcolati dal backend (HMAC con segreto) per le carte che non lo hanno: [{id, phone_hash}].
create or replace function set_customer_phone_hashes(p_items jsonb)
returns int
language sql
security definer
set search_path = public
as $$
  with upd as (
    update customers c
       set phone_hash = i.phone_hash
      from jsonb_to_recordset(p_items) as i(id uuid, phone_hash text)
     where c.id = i.id and c.phone is not null and c.phone_hash is null
    returning 1)
  select count(*)::int from upd;
$$;

-- ---------- helper ----------

create or replace function _require_support(p_meta jsonb)
returns void
language plpgsql
stable
set search_path = public
as $$
begin
  if coalesce(p_meta->>'actor_type', '') <> 'support' or coalesce(p_meta->>'actor_id', '') = '' then
    perform _raise('E_SUPPORT_FORBIDDEN', jsonb_build_object('reason', 'operazione riservata all''assistenza'));
  end if;
end;
$$;

create or replace function _shop_json(p_s shops)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object('id', p_s.id, 'slug', p_s.slug, 'name', p_s.name, 'status', p_s.status,
                            'legal_name', p_s.legal_name, 'vat_number', p_s.vat_number,
                            'privacy_email', p_s.privacy_email);
$$;

-- Slug non usabili come negozio: sono percorsi del sito.
create or replace function _reserved_slug(p_slug text)
returns boolean
language sql
immutable
as $$
  select p_slug = any (array['interno', 'api', 'u', 'admin', 'assistenza', 'privacy', 'robots', 'favicon',
                             'static', 'brand', 'invito', 'login', 'accesso', 'www', 'app', 'docs']);
$$;

-- ---------- team ----------

create or replace function support_member_add(p_user_id uuid, p_display_name text, p_email text, p_meta jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before support_members;
begin
  select * into v_before from support_members where user_id = p_user_id;
  insert into support_members (user_id, display_name, email, active, created_by)
  values (p_user_id, trim(p_display_name), lower(trim(p_email)), true, coalesce(p_meta->>'actor_id', 'script'))
  on conflict (user_id) do update set display_name = excluded.display_name, email = excluded.email, active = true;
  perform _audit(p_meta, null, 'support_member_add', 'support_member', p_user_id::text,
                 case when v_before.user_id is null then null
                      else jsonb_build_object('active', v_before.active, 'display_name', v_before.display_name) end,
                 jsonb_build_object('active', true, 'display_name', trim(p_display_name)));
  return jsonb_build_object('user_id', p_user_id, 'existing', v_before.user_id is not null);
end;
$$;

-- ---------- negozi ----------

create or replace function create_shop(
  p_slug text, p_name text, p_owner_user_id uuid, p_owner_name text,
  p_legal_name text, p_vat_number text, p_privacy_email text, p_meta jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slug text := lower(trim(p_slug));
  v_s shops;
begin
  perform _require_support(p_meta);
  if v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or length(v_slug) not between 3 and 40 then
    perform _raise('E_VALIDATION', jsonb_build_object('field', 'slug', 'reason', 'formato non valido'));
  end if;
  if _reserved_slug(v_slug) then
    perform _raise('E_SHOP_SLUG_TAKEN', jsonb_build_object('slug', v_slug, 'reason', 'riservato'));
  end if;
  if exists (select 1 from shops where slug = v_slug) then
    perform _raise('E_SHOP_SLUG_TAKEN', jsonb_build_object('slug', v_slug, 'reason', 'già usato'));
  end if;

  insert into shops (slug, name, reward_label, legal_name, vat_number, privacy_email)
  values (v_slug, trim(p_name), 'Premio in omaggio', nullif(trim(p_legal_name), ''),
          nullif(trim(p_vat_number), ''), nullif(lower(trim(p_privacy_email)), ''))
  returning * into v_s;

  insert into staff (user_id, shop_id, role, display_name)
  values (p_owner_user_id, v_s.id, 'owner', trim(p_owner_name));

  perform _audit(p_meta, v_s.id, 'shop_create', 'shop', v_s.id::text, null, _shop_json(v_s));
  perform _audit(p_meta, v_s.id, 'staff_invite', 'staff', p_owner_user_id::text, null,
                 jsonb_build_object('role', 'owner', 'display_name', trim(p_owner_name)));
  return _shop_json(v_s);
end;
$$;

create or replace function set_shop_status(p_shop_id uuid, p_status text, p_reason text, p_meta jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_s shops;
begin
  perform _require_support(p_meta);
  if p_status not in ('active', 'suspended') then
    perform _raise('E_VALIDATION', jsonb_build_object('field', 'status'));
  end if;
  if length(trim(coalesce(p_reason, ''))) < 5 then
    perform _raise('E_VALIDATION', jsonb_build_object('field', 'reason', 'reason', 'motivo obbligatorio'));
  end if;
  select * into v_s from shops where id = p_shop_id for update;
  if not found then
    perform _raise('E_SHOP_NOT_FOUND', jsonb_build_object('shop_id', p_shop_id));
  end if;
  if v_s.status = p_status then
    return _shop_json(v_s) || jsonb_build_object('changed', false);
  end if;
  update shops set status = p_status where id = p_shop_id;
  perform _audit(p_meta, p_shop_id, case when p_status = 'suspended' then 'shop_suspend' else 'shop_reactivate' end,
                 'shop', p_shop_id::text, jsonb_build_object('status', v_s.status),
                 jsonb_build_object('status', p_status), trim(p_reason));
  return _shop_json(v_s) || jsonb_build_object('status', p_status, 'changed', true);
end;
$$;

create or replace function update_shop_legal(
  p_shop_id uuid, p_legal_name text, p_vat_number text, p_privacy_email text, p_meta jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_s shops;
  v_new shops;
begin
  perform _require_support(p_meta);
  select * into v_s from shops where id = p_shop_id for update;
  if not found then
    perform _raise('E_SHOP_NOT_FOUND', jsonb_build_object('shop_id', p_shop_id));
  end if;
  update shops
     set legal_name = nullif(trim(p_legal_name), ''), vat_number = nullif(trim(p_vat_number), ''),
         privacy_email = nullif(lower(trim(p_privacy_email)), '')
   where id = p_shop_id
  returning * into v_new;
  if (v_s.legal_name, v_s.vat_number, v_s.privacy_email)
     is distinct from (v_new.legal_name, v_new.vat_number, v_new.privacy_email) then
    perform _audit(p_meta, p_shop_id, 'shop_legal_update', 'shop', p_shop_id::text,
                   jsonb_build_object('legal_name', v_s.legal_name, 'vat_number', v_s.vat_number,
                                      'privacy_email', v_s.privacy_email),
                   jsonb_build_object('legal_name', v_new.legal_name, 'vat_number', v_new.vat_number,
                                      'privacy_email', v_new.privacy_email));
  end if;
  return _shop_json(v_new);
end;
$$;

-- ---------- GDPR: esportazione dei dati di un cliente ----------

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
    'modifiche_registrate', coalesce((
      select jsonb_agg(jsonb_build_object('quando', a.ts, 'azione', a.action, 'prima', a.before,
                                          'dopo', a.after, 'motivo', a.reason) order by a.ts)
        from audit_log a where a.entity = 'customer' and a.entity_id = v_c.id::text), '[]'),
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

-- La cancellazione toglie anche l'hash del telefono (stessa funzione della Fase 2, più phone_hash).
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
                 jsonb_build_object('deleted', true, 'audit_rows_pseudonymized', v_rows),
                 nullif(trim(coalesce(p_reason, '')), ''));

  return _card_json(v_c, v_s)
      || jsonb_build_object('deleted', true, 'audit_rows_pseudonymized', v_rows)
      || v_extra;
end;
$$;

-- ---------- tracce delle azioni dell'assistenza senza modifica di dati di dominio ----------

-- Risincronizzazione, modalità diagnostica: restano nello storico permanente con chi e perché.
create or replace function support_record(
  p_meta jsonb, p_shop_id uuid, p_action text, p_entity text, p_entity_id text, p_after jsonb, p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform _require_support(p_meta);
  if p_action not in ('wallet_resync', 'diagnostic_enable', 'diagnostic_disable') then
    perform _raise('E_VALIDATION', jsonb_build_object('field', 'action', 'value', p_action));
  end if;
  perform _audit(p_meta, p_shop_id, p_action, p_entity, p_entity_id, null, p_after, nullif(trim(coalesce(p_reason, '')), ''));
end;
$$;

-- ---------- permessi: solo il backend (service role) ----------

revoke all on function purge_log_events(int) from public, anon, authenticated;
revoke all on function enrollment_complete(uuid, uuid) from public, anon, authenticated;
revoke all on function set_customer_phone_hashes(jsonb) from public, anon, authenticated;
revoke all on function _require_support(jsonb) from public, anon, authenticated;
revoke all on function _shop_json(shops) from public, anon, authenticated;
revoke all on function _reserved_slug(text) from public, anon, authenticated;
revoke all on function support_member_add(uuid, text, text, jsonb) from public, anon, authenticated;
revoke all on function create_shop(text, text, uuid, text, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function set_shop_status(uuid, text, text, jsonb) from public, anon, authenticated;
revoke all on function update_shop_legal(uuid, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function support_customer_export(uuid, jsonb) from public, anon, authenticated;
revoke all on function delete_customer(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function support_record(jsonb, uuid, text, text, text, jsonb, text) from public, anon, authenticated;
