-- =============================================================
-- Motore di sincronizzazione con i wallet: esito di ogni tentativo,
-- coda dei nuovi tentativi con backoff (1, 5, 15, 60 minuti, poi
-- esaurito) e ricerca delle carte da riallineare.
-- =============================================================

-- wallet_sync_failures diventa la coda generica dei tentativi falliti:
--   object  = stato della carta del cliente
--   class   = template del programma del negozio (customer_id vuoto)
--   message = messaggio/notifica su una carta (payload: id, titolo, testo)
alter table wallet_sync_failures
  alter column customer_id drop not null,
  add column kind       text  not null default 'object' check (kind in ('object', 'class', 'message')),
  add column payload    jsonb not null default '{}',
  add column updated_at timestamptz not null default now(),
  add constraint wallet_sync_failures_target check (kind = 'class' or customer_id is not null);

-- al massimo un tentativo aperto per bersaglio (carta, template, messaggio)
create unique index wallet_sync_failures_open_key
  on wallet_sync_failures (kind, wallet, coalesce(customer_id, shop_id), coalesce(payload->>'message_id', ''))
  where resolved_at is null and exhausted_at is null;

alter table wallet_sync_state add column synced_version int;

-- Registra l'esito di un tentativo. In caso di errore pianifica il successivo:
-- dopo il tentativo n fallito si riprova tra 1, 5, 15, 60 minuti; al 5° errore è esaurito.
create or replace function wallet_sync_record(
  p_kind text, p_wallet text, p_shop_id uuid, p_customer_id uuid,
  p_ok boolean, p_synced jsonb, p_error_code text, p_error text, p_request_id text, p_payload jsonb default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  schedule constant int[] := array[1, 5, 15, 60];
  v_target uuid := coalesce(p_customer_id, p_shop_id);
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
  end if;

  select * into v_fail
    from wallet_sync_failures
   where kind = p_kind and wallet = p_wallet and coalesce(customer_id, shop_id) = v_target
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
                                      next_retry_at, kind, payload)
    values (p_customer_id, p_wallet, p_shop_id, p_request_id, p_error_code, left(p_error, 1000), 1,
            v_next, p_kind, p_payload);
  end if;

  return jsonb_build_object('attempt', v_attempt, 'next_retry_at', v_next,
                            'retry_in_min', case when v_next is not null then schedule[v_attempt] end,
                            'exhausted', v_next is null);
end;
$$;

-- Prende i tentativi da rifare. SKIP LOCKED + "affitto" di 2 minuti: due esecuzioni
-- del cron in parallelo non lavorano mai sullo stesso tentativo.
create or replace function wallet_sync_claim_due(p_limit int)
returns setof wallet_sync_failures
language sql
security definer
set search_path = public
as $$
  update wallet_sync_failures
     set next_retry_at = now() + interval '2 minutes', updated_at = now()
   where id in (
     select id from wallet_sync_failures
      where resolved_at is null and exhausted_at is null and next_retry_at <= now()
      order by next_retry_at
      limit p_limit
      for update skip locked)
  returning *;
$$;

-- Carte Google non allineate al database (saldo, stato o versione della carta) da più di 2 minuti
-- e senza tentativi già in coda: le riallinea la riconciliazione del cron.
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
     and not (c.deleted_at is not null and s.customer_id is null)  -- cancellata prima di arrivare su Google
   order by c.created_at
   limit p_limit;
$$;

revoke all on function wallet_sync_record(text, text, uuid, uuid, boolean, jsonb, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function wallet_sync_claim_due(int) from public, anon, authenticated;
revoke all on function wallet_sync_drifted(int) from public, anon, authenticated;
