-- =============================================================
-- Funzioni di dominio atomiche. Timbri, premi e dati dei clienti
-- cambiano SOLO da qui: ogni funzione blocca la riga della carta,
-- verifica le regole, aggiorna i dati e scrive audit_log nella
-- stessa transazione.
--
-- Parametro comune p_meta (jsonb), costruito dal backend:
--   { request_id, actor_type: staff|customer|system|support, actor_id,
--     platform, app_version, ip_hash }
--
-- Errori: `raise exception '<CODICE DEL CATALOGO>'` con i dettagli in
-- JSON nel campo detail. Il backend li converte negli errori di
-- packages/shared/errors.ts (apps/web/src/lib/db-errors.ts).
-- =============================================================

drop function if exists add_stamp(uuid, uuid);
drop function if exists redeem_reward(uuid, uuid);

-- ---------- helper ----------

create or replace function _raise(p_code text, p_detail jsonb default '{}')
returns void
language plpgsql
as $$
begin
  raise exception '%', p_code using detail = p_detail::text;
end;
$$;

-- Verifica che l'attore sia staff del negozio (e titolare, se richiesto).
create or replace function _require_staff(p_meta jsonb, p_shop_id uuid, p_owner_only boolean)
returns staff
language plpgsql
stable
set search_path = public
as $$
declare
  v_staff staff;
begin
  if coalesce(p_meta->>'actor_type', '') <> 'staff' or p_meta->>'actor_id' is null then
    perform _raise('E_FORBIDDEN_ROLE', jsonb_build_object('reason', 'operazione riservata allo staff'));
  end if;
  select * into v_staff from staff where user_id = (p_meta->>'actor_id')::uuid and shop_id = p_shop_id;
  if not found then
    perform _raise('E_FORBIDDEN_SHOP', jsonb_build_object('user_id', p_meta->>'actor_id', 'shop_id', p_shop_id));
  end if;
  if p_owner_only and v_staff.role <> 'owner' then
    perform _raise('E_FORBIDDEN_ROLE', jsonb_build_object('user_id', v_staff.user_id, 'role', v_staff.role, 'required', 'owner'));
  end if;
  return v_staff;
end;
$$;

create or replace function _audit(
  p_meta jsonb, p_shop_id uuid, p_action text, p_entity text, p_entity_id text,
  p_before jsonb, p_after jsonb, p_reason text default null
)
returns void
language sql
set search_path = public
as $$
  insert into audit_log (request_id, shop_id, actor_type, actor_id, action, entity, entity_id,
                         before, after, reason, platform, app_version, ip_hash)
  values (p_meta->>'request_id', p_shop_id, coalesce(p_meta->>'actor_type', 'system'), p_meta->>'actor_id',
          p_action, p_entity, p_entity_id, p_before, p_after, p_reason,
          p_meta->>'platform', p_meta->>'app_version', p_meta->>'ip_hash');
$$;

-- Errore se la carta è stata cancellata.
create or replace function _ensure_not_deleted(p_c customers)
returns void
language plpgsql
as $$
begin
  if p_c.deleted_at is not null then
    perform _raise('E_CARD_DELETED', jsonb_build_object('short_code', p_c.short_code, 'deleted_at', p_c.deleted_at));
  end if;
end;
$$;

create or replace function _card_json(p_c customers, p_s shops)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'customer_id', p_c.id, 'short_code', p_c.short_code, 'qr_token', p_c.qr_token,
    'stamps', p_c.stamps, 'rewards_available', p_c.rewards_available,
    'stamps_required', p_s.stamps_required, 'deleted', p_c.deleted_at is not null
  );
$$;

-- ---------- iscrizione ----------

-- Crea il cliente o ritrova quello attivo con lo stesso telefono nel negozio.
create or replace function enroll_customer(
  p_shop_id uuid, p_name text, p_phone text, p_consent_privacy boolean, p_consent_marketing boolean, p_meta jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_s shops;
  v_c customers;
  v_constraint text;
begin
  select * into v_s from shops where id = p_shop_id;
  if not found then
    perform _raise('E_SHOP_NOT_FOUND', jsonb_build_object('shop_id', p_shop_id));
  end if;
  if v_s.status <> 'active' then
    perform _raise('E_SHOP_SUSPENDED', jsonb_build_object('shop_id', p_shop_id));
  end if;
  if not coalesce(p_consent_privacy, false) then
    perform _raise('E_PRIVACY_CONSENT_REQUIRED');
  end if;

  for attempt in 1..5 loop
    select * into v_c from customers where shop_id = p_shop_id and phone = p_phone and deleted_at is null;
    if found then
      return _card_json(v_c, v_s) || jsonb_build_object('returning', true);
    end if;
    begin
      insert into customers (shop_id, name, phone, consent_privacy, consent_marketing)
      values (p_shop_id, p_name, p_phone, true, coalesce(p_consent_marketing, false))
      returning * into v_c;

      perform _audit(p_meta || jsonb_build_object('actor_type', 'customer', 'actor_id', v_c.id),
                     p_shop_id, 'enroll', 'customer', v_c.id::text, null,
                     jsonb_build_object('name', v_c.name, 'short_code', v_c.short_code,
                                        'consent_privacy', true, 'consent_marketing', v_c.consent_marketing));
      return _card_json(v_c, v_s) || jsonb_build_object('returning', false);
    exception when unique_violation then
      -- stesso telefono iscritto in parallelo, o codice breve già usato: si riprova
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint not in ('customers_shop_phone_active_key', 'customers_shop_short_code_key') then
        raise;
      end if;
    end;
  end loop;
  raise exception 'enroll_customer: impossibile generare un codice breve univoco';
end;
$$;


-- Dati dello staff che ha agito, restituiti al backend per i log ("Giulia (titolare, web) …").
create or replace function _staff_json(p_staff staff)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object('staff_name', p_staff.display_name, 'staff_role', p_staff.role);
$$;

-- ---------- timbri ----------

-- Aggiunge un timbro; al raggiungimento della soglia azzera i timbri e accredita un premio.
-- Il lock della riga serializza le scansioni concorrenti; il cooldown blocca i doppi timbri.
create or replace function add_stamp(p_customer_id uuid, p_meta jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_c customers;
  v_s shops;
  v_staff staff;
  v_last timestamptz;
  v_elapsed numeric;
  v_stamps int;
  v_rewards int;
  v_unlocked boolean := false;
  v_event_id bigint;
begin
  select * into v_c from customers where id = p_customer_id for update;
  if not found then
    perform _raise('E_CARD_NOT_FOUND', jsonb_build_object('customer_id', p_customer_id));
  end if;
  select * into v_s from shops where id = v_c.shop_id;
  v_staff := _require_staff(p_meta, v_s.id, false);
  perform _ensure_not_deleted(v_c);
  if v_s.status <> 'active' then
    perform _raise('E_SHOP_SUSPENDED', jsonb_build_object('shop_id', v_s.id));
  end if;

  if v_s.stamp_cooldown_minutes > 0 then
    select max(created_at) into v_last
      from stamp_events
     where customer_id = v_c.id and kind = 'stamp' and undone_at is null;
    v_elapsed := extract(epoch from (now() - v_last));
    if v_last is not null and v_elapsed < v_s.stamp_cooldown_minutes * 60 then
      perform _raise('E_STAMP_COOLDOWN', jsonb_build_object(
        'short_code', v_c.short_code,
        'last_stamp_at', v_last,
        'cooldown_min', v_s.stamp_cooldown_minutes,
        'minutes_since', floor(v_elapsed / 60)::int,
        'minutes_left', ceil((v_s.stamp_cooldown_minutes * 60 - v_elapsed) / 60)::int
      ) || _staff_json(v_staff));
    end if;
  end if;

  v_stamps := v_c.stamps + 1;
  v_rewards := v_c.rewards_available;
  if v_stamps >= v_s.stamps_required then
    v_stamps := 0;
    v_rewards := v_rewards + 1;
    v_unlocked := true;
  end if;

  update customers set stamps = v_stamps, rewards_available = v_rewards where id = v_c.id;
  insert into stamp_events (shop_id, customer_id, staff_user_id, kind, stamps_before, rewards_before, reward_unlocked)
  values (v_s.id, v_c.id, v_staff.user_id, 'stamp', v_c.stamps, v_c.rewards_available, v_unlocked)
  returning id into v_event_id;

  perform _audit(p_meta, v_s.id, 'stamp', 'customer', v_c.id::text,
                 jsonb_build_object('stamps', v_c.stamps, 'rewards_available', v_c.rewards_available),
                 jsonb_build_object('stamps', v_stamps, 'rewards_available', v_rewards,
                                    'reward_unlocked', v_unlocked, 'stamp_event_id', v_event_id));

  return _card_json(v_c, v_s)
      || jsonb_build_object('stamps', v_stamps, 'rewards_available', v_rewards,
                            'stamps_before', v_c.stamps, 'rewards_before', v_c.rewards_available,
                            'reward_unlocked', v_unlocked, 'stamp_event_id', v_event_id)
      || _staff_json(v_staff);
end;
$$;

-- Annulla l'ultimo timbro: entro 5 minuti, solo chi l'ha dato, solo se è l'ultima
-- operazione sulla carta e non ha sbloccato un premio già riscattato.
-- Ripristina esattamente timbri e premi di prima (anche togliendo il premio sbloccato).
create or replace function undo_last_stamp(p_customer_id uuid, p_meta jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_c customers;
  v_s shops;
  v_staff staff;
  v_stamp stamp_events;
  v_later text;
  v_stamped_by text;
begin
  select * into v_c from customers where id = p_customer_id for update;
  if not found then
    perform _raise('E_CARD_NOT_FOUND', jsonb_build_object('customer_id', p_customer_id));
  end if;
  select * into v_s from shops where id = v_c.shop_id;
  v_staff := _require_staff(p_meta, v_s.id, false);
  perform _ensure_not_deleted(v_c);

  select * into v_stamp
    from stamp_events
   where customer_id = v_c.id and kind = 'stamp' and undone_at is null
   order by id desc
   limit 1;
  if not found then
    perform _raise('E_NOTHING_TO_UNDO', jsonb_build_object('short_code', v_c.short_code) || _staff_json(v_staff));
  end if;

  if v_stamp.reward_unlocked and exists (
    select 1 from stamp_events where customer_id = v_c.id and id > v_stamp.id and kind = 'redeem' and undone_at is null
  ) then
    perform _raise('E_UNDO_REWARD_REDEEMED', jsonb_build_object('short_code', v_c.short_code) || _staff_json(v_staff));
  end if;

  select kind into v_later
    from stamp_events
   where customer_id = v_c.id and id > v_stamp.id and undone_at is null
   order by id
   limit 1;
  if v_later is not null then
    perform _raise('E_UNDO_NOT_LAST', jsonb_build_object('short_code', v_c.short_code, 'later_kind', v_later)
                                      || _staff_json(v_staff));
  end if;

  if v_stamp.staff_user_id is distinct from v_staff.user_id then
    select display_name into v_stamped_by from staff where user_id = v_stamp.staff_user_id and shop_id = v_s.id;
    perform _raise('E_UNDO_OTHER_OPERATOR', jsonb_build_object(
      'short_code', v_c.short_code, 'stamped_by', coalesce(v_stamped_by, 'un utente non più nello staff')
    ) || _staff_json(v_staff));
  end if;

  if v_stamp.created_at < now() - interval '5 minutes' or v_stamp.stamps_before is null then
    perform _raise('E_UNDO_EXPIRED', jsonb_build_object(
      'short_code', v_c.short_code, 'stamped_at', v_stamp.created_at,
      'minutes_ago', floor(extract(epoch from (now() - v_stamp.created_at)) / 60)::int
    ) || _staff_json(v_staff));
  end if;

  update customers
     set stamps = v_stamp.stamps_before, rewards_available = v_stamp.rewards_before
   where id = v_c.id;
  update stamp_events set undone_at = now(), undone_by = v_staff.user_id where id = v_stamp.id;

  perform _audit(p_meta, v_s.id, 'undo', 'customer', v_c.id::text,
                 jsonb_build_object('stamps', v_c.stamps, 'rewards_available', v_c.rewards_available),
                 jsonb_build_object('stamps', v_stamp.stamps_before, 'rewards_available', v_stamp.rewards_before,
                                    'undone_stamp_event_id', v_stamp.id, 'reward_removed', v_stamp.reward_unlocked));

  return _card_json(v_c, v_s)
      || jsonb_build_object('stamps', v_stamp.stamps_before, 'rewards_available', v_stamp.rewards_before,
                            'stamps_before', v_c.stamps, 'rewards_before', v_c.rewards_available,
                            'reward_removed', v_stamp.reward_unlocked)
      || _staff_json(v_staff);
end;
$$;

-- ---------- premi ----------

create or replace function redeem_reward(p_customer_id uuid, p_meta jsonb)
returns jsonb
language plpgsql
security definer
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
  v_staff := _require_staff(p_meta, v_s.id, false);
  perform _ensure_not_deleted(v_c);
  if v_s.status <> 'active' then
    perform _raise('E_SHOP_SUSPENDED', jsonb_build_object('shop_id', v_s.id));
  end if;
  if v_c.rewards_available < 1 then
    perform _raise('E_NO_REWARD', jsonb_build_object('short_code', v_c.short_code, 'stamps', v_c.stamps)
                                  || _staff_json(v_staff));
  end if;

  update customers set rewards_available = v_c.rewards_available - 1 where id = v_c.id;
  insert into stamp_events (shop_id, customer_id, staff_user_id, kind, stamps_before, rewards_before)
  values (v_s.id, v_c.id, v_staff.user_id, 'redeem', v_c.stamps, v_c.rewards_available);

  perform _audit(p_meta, v_s.id, 'redeem', 'customer', v_c.id::text,
                 jsonb_build_object('stamps', v_c.stamps, 'rewards_available', v_c.rewards_available),
                 jsonb_build_object('stamps', v_c.stamps, 'rewards_available', v_c.rewards_available - 1));

  return _card_json(v_c, v_s)
      || jsonb_build_object('rewards_available', v_c.rewards_available - 1, 'rewards_before', v_c.rewards_available)
      || _staff_json(v_staff);
end;
$$;

-- Rettifica a valori assoluti: solo titolare, motivo obbligatorio.
create or replace function adjust_balance(
  p_customer_id uuid, p_stamps int, p_rewards int, p_reason text, p_meta jsonb
)
returns jsonb
language plpgsql
security definer
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
  v_staff := _require_staff(p_meta, v_s.id, true);
  perform _ensure_not_deleted(v_c);

  if length(trim(coalesce(p_reason, ''))) < 5 then
    perform _raise('E_VALIDATION', jsonb_build_object('field', 'reason',
      'problem', 'il motivo della rettifica è obbligatorio (almeno 5 caratteri)'));
  end if;
  if p_stamps is null or p_stamps < 0 or p_stamps >= v_s.stamps_required then
    perform _raise('E_VALIDATION', jsonb_build_object('field', 'stamps',
      'problem', format('i timbri devono essere tra 0 e %s', v_s.stamps_required - 1)));
  end if;
  if p_rewards is null or p_rewards < 0 or p_rewards > 99 then
    perform _raise('E_VALIDATION', jsonb_build_object('field', 'rewards', 'problem', 'i premi devono essere tra 0 e 99'));
  end if;

  update customers set stamps = p_stamps, rewards_available = p_rewards where id = v_c.id;
  insert into stamp_events (shop_id, customer_id, staff_user_id, kind, stamps_before, rewards_before)
  values (v_s.id, v_c.id, v_staff.user_id, 'adjust', v_c.stamps, v_c.rewards_available);

  perform _audit(p_meta, v_s.id, 'adjust', 'customer', v_c.id::text,
                 jsonb_build_object('stamps', v_c.stamps, 'rewards_available', v_c.rewards_available),
                 jsonb_build_object('stamps', p_stamps, 'rewards_available', p_rewards),
                 trim(p_reason));

  return _card_json(v_c, v_s)
      || jsonb_build_object('stamps', p_stamps, 'rewards_available', p_rewards,
                            'stamps_before', v_c.stamps, 'rewards_before', v_c.rewards_available)
      || _staff_json(v_staff);
end;
$$;

-- ---------- dati del cliente ----------

-- Cancella i dati personali (titolare o assistenza). La riga resta senza nome, telefono e
-- consensi; l'audit del cliente viene pseudonimizzato togliendo nome e telefono.
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
    v_extra := jsonb_build_object('staff_name', 'assistenza', 'staff_role', 'support');
  else
    v_extra := _staff_json(_require_staff(p_meta, v_s.id, true));
  end if;
  perform _ensure_not_deleted(v_c);

  update customers
     set name = 'Cliente cancellato', phone = null, consent_privacy = false, consent_marketing = false,
         deleted_at = now()
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

-- Consenso marketing: dal titolare (app) o dal cliente stesso (link di disiscrizione, Fase 5).
-- Nessuna riga di audit se il valore non cambia.
create or replace function set_marketing_consent(p_customer_id uuid, p_consent boolean, p_meta jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_c customers;
  v_s shops;
  v_extra jsonb;
begin
  select * into v_c from customers where id = p_customer_id for update;
  if not found then
    perform _raise('E_CARD_NOT_FOUND', jsonb_build_object('customer_id', p_customer_id));
  end if;
  select * into v_s from shops where id = v_c.shop_id;
  if coalesce(p_meta->>'actor_type', '') = 'customer' then
    if p_meta->>'actor_id' is distinct from v_c.id::text then
      perform _raise('E_FORBIDDEN_ROLE', jsonb_build_object('reason', 'un cliente può cambiare solo il proprio consenso'));
    end if;
    v_extra := jsonb_build_object('staff_name', 'il cliente', 'staff_role', 'customer');
  else
    v_extra := _staff_json(_require_staff(p_meta, v_s.id, true));
  end if;
  perform _ensure_not_deleted(v_c);

  if v_c.consent_marketing = p_consent then
    return _card_json(v_c, v_s) || jsonb_build_object('changed', false, 'consent_marketing', p_consent) || v_extra;
  end if;

  update customers set consent_marketing = p_consent where id = v_c.id;
  perform _audit(p_meta, v_s.id, 'marketing_consent', 'customer', v_c.id::text,
                 jsonb_build_object('consent_marketing', v_c.consent_marketing),
                 jsonb_build_object('consent_marketing', p_consent));

  return _card_json(v_c, v_s) || jsonb_build_object('changed', true, 'consent_marketing', p_consent) || v_extra;
end;
$$;

-- ---------- permessi: solo il backend (service role) ----------

revoke all on function _raise(text, jsonb) from public, anon, authenticated;
revoke all on function _require_staff(jsonb, uuid, boolean) from public, anon, authenticated;
revoke all on function _audit(jsonb, uuid, text, text, text, jsonb, jsonb, text) from public, anon, authenticated;
revoke all on function _ensure_not_deleted(customers) from public, anon, authenticated;
revoke all on function _card_json(customers, shops) from public, anon, authenticated;
revoke all on function _staff_json(staff) from public, anon, authenticated;
revoke all on function generate_short_code() from public, anon, authenticated;
revoke all on function enroll_customer(uuid, text, text, boolean, boolean, jsonb) from public, anon, authenticated;
revoke all on function add_stamp(uuid, jsonb) from public, anon, authenticated;
revoke all on function undo_last_stamp(uuid, jsonb) from public, anon, authenticated;
revoke all on function redeem_reward(uuid, jsonb) from public, anon, authenticated;
revoke all on function adjust_balance(uuid, int, int, text, jsonb) from public, anon, authenticated;
revoke all on function delete_customer(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function set_marketing_consent(uuid, boolean, jsonb) from public, anon, authenticated;
