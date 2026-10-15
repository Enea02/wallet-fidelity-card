-- =============================================================
-- Fase 7: idempotenza delle azioni sul saldo e timbro forzato.
--
-- Ogni tocco nell'app ("+1 timbro", "Annulla ultimo timbro", "Riscatta premio") porta una
-- chiave (header Idempotency-Key). card_action registra la chiave, esegue l'azione e salva la
-- risposta nella stessa transazione: una seconda richiesta con la stessa chiave riceve la
-- risposta salvata senza toccare il saldo. Con due richieste contemporanee la seconda attende
-- sull'inserimento della chiave finché la prima non ha finito. Se l'azione viene rifiutata
-- (es. cooldown) la transazione si annulla e la chiave non resta.
--
-- Timbro forzato (design Staff, "Aggiungi comunque"): durante il cooldown lo staff può dare
-- comunque il timbro; resta nell'audit con chi l'ha dato, i minuti mancanti e il motivo.
-- =============================================================

create table action_keys (
  shop_id     uuid not null references shops (id) on delete cascade,
  key         uuid not null,
  user_id     uuid not null,
  action      text not null check (action in ('stamp', 'undo', 'redeem')),
  customer_id uuid not null,
  response    jsonb,
  created_at  timestamptz not null default now(),
  primary key (shop_id, key)
);
create index action_keys_created_at on action_keys (created_at);
alter table action_keys enable row level security;

comment on table action_keys is
  'Chiavi di idempotenza delle azioni sul saldo (timbro, annullamento, riscatto): risposta salvata per 48 ore.';

-- ---------- timbro, con l'opzione di forzare il cooldown ----------

drop function if exists add_stamp(uuid, jsonb);

create or replace function add_stamp(p_customer_id uuid, p_meta jsonb, p_force boolean default false)
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
  v_forced boolean := false;
  v_minutes_left int;
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
      v_minutes_left := ceil((v_s.stamp_cooldown_minutes * 60 - v_elapsed) / 60)::int;
      if not coalesce(p_force, false) then
        perform _raise('E_STAMP_COOLDOWN', jsonb_build_object(
          'short_code', v_c.short_code,
          'last_stamp_at', v_last,
          'cooldown_min', v_s.stamp_cooldown_minutes,
          'minutes_since', floor(v_elapsed / 60)::int,
          'minutes_left', v_minutes_left
        ) || _staff_json(v_staff));
      end if;
      v_forced := true;
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
                                    'reward_unlocked', v_unlocked, 'stamp_event_id', v_event_id)
                 || case when v_forced
                      then jsonb_build_object('forced', true, 'cooldown_minutes_left', v_minutes_left,
                                              'last_stamp_at', v_last)
                      else '{}'::jsonb end,
                 case when v_forced then 'timbro forzato durante il cooldown' end);

  return _card_json(v_c, v_s)
      || jsonb_build_object('stamps', v_stamps, 'rewards_available', v_rewards,
                            'stamps_before', v_c.stamps, 'rewards_before', v_c.rewards_available,
                            'reward_unlocked', v_unlocked, 'stamp_event_id', v_event_id,
                            'forced', v_forced, 'cooldown_minutes_left', v_minutes_left,
                            'last_stamp_at', v_last, 'cooldown_min', v_s.stamp_cooldown_minutes)
      || _staff_json(v_staff);
end;
$$;

-- ---------- azione idempotente sul saldo ----------

create or replace function card_action(p_action text, p_customer_id uuid, p_meta jsonb, p_force boolean default false)
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
begin
  if p_action not in ('stamp', 'undo', 'redeem') then
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

    -- con una richiesta gemella in corso, l'inserimento attende che finisca
    insert into action_keys (shop_id, key, user_id, action, customer_id)
    values (v_shop, v_key, v_user, p_action, p_customer_id)
    on conflict (shop_id, key) do nothing;

    if not found then
      select * into v_row from action_keys where shop_id = v_shop and key = v_key;
      if v_row.action <> p_action or v_row.customer_id <> p_customer_id or v_row.user_id <> v_user then
        perform _raise('E_VALIDATION', jsonb_build_object(
          'problem', 'chiave di idempotenza già usata per un''altra operazione'));
      end if;
      return v_row.response
          || jsonb_build_object('duplicate', true, 'original_at', v_row.created_at);
    end if;
  end if;

  v_res := case p_action
    when 'stamp' then add_stamp(p_customer_id, p_meta, p_force)
    when 'undo' then undo_last_stamp(p_customer_id, p_meta)
    else redeem_reward(p_customer_id, p_meta)
  end;

  if v_key is not null then
    update action_keys set response = v_res where shop_id = v_shop and key = v_key;
  end if;
  return v_res || jsonb_build_object('duplicate', false);
end;
$$;

-- Pulizia (cron): le chiavi servono solo per i tentativi ravvicinati.
create or replace function action_keys_cleanup()
returns int
language sql
security definer
set search_path = public
as $$
  with gone as (delete from action_keys where created_at < now() - interval '48 hours' returning 1)
  select count(*)::int from gone;
$$;

revoke all on function add_stamp(uuid, jsonb, boolean) from public, anon, authenticated;
revoke all on function card_action(text, uuid, jsonb, boolean) from public, anon, authenticated;
revoke all on function action_keys_cleanup() from public, anon, authenticated;
