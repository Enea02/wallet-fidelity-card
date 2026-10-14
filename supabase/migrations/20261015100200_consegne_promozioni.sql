-- =============================================================
-- Invio delle promozioni ai wallet: una riga per promozione e cliente
-- (unica), così un nuovo tentativo o due esecuzioni del cron non
-- mandano mai lo stesso messaggio due volte.
-- =============================================================

create table promotion_deliveries (
  promotion_id    uuid not null references promotions(id) on delete cascade,
  customer_id     uuid not null references customers(id) on delete cascade,
  status          text not null default 'pending' check (status in ('pending', 'sent', 'skipped', 'failed')),
  attempts        int  not null default 0,
  next_attempt_at timestamptz not null default now(),
  error_code      text,
  error           text,
  skip_reason     text,
  sent_at         timestamptz,
  updated_at      timestamptz not null default now(),
  primary key (promotion_id, customer_id)
);

create index promotion_deliveries_pending_idx on promotion_deliveries (next_attempt_at) where status = 'pending';
alter table promotion_deliveries enable row level security;

-- Prepara le consegne delle promozioni in coda: destinatari = clienti attivi con consenso ADESSO.
create or replace function promotions_prepare()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int := 0;
  v_promo promotions;
begin
  for v_promo in
    select * from promotions where status = 'queued' order by created_at for update skip locked
  loop
    insert into promotion_deliveries (promotion_id, customer_id)
    select v_promo.id, c.id
      from customers c
     where c.shop_id = v_promo.shop_id and c.deleted_at is null and c.consent_marketing
    on conflict do nothing;
    update promotions set status = 'sending' where id = v_promo.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- Prende le consegne da fare (SKIP LOCKED + affitto di 2 minuti), con i dati per inviarle.
create or replace function promotion_deliveries_claim(p_limit int)
returns table (promotion_id uuid, customer_id uuid, shop_id uuid, body text, attempts int, consent boolean, deleted boolean)
language sql
security definer
set search_path = public
as $$
  with claimed as (
    update promotion_deliveries d
       set next_attempt_at = now() + interval '2 minutes', updated_at = now()
     where (d.promotion_id, d.customer_id) in (
       select promotion_id, customer_id from promotion_deliveries
        where status = 'pending' and next_attempt_at <= now()
        order by next_attempt_at
        limit p_limit
        for update skip locked)
    returning d.*
  )
  select cl.promotion_id, cl.customer_id, p.shop_id, p.body, cl.attempts,
         c.consent_marketing, c.deleted_at is not null
    from claimed cl
    join promotions p on p.id = cl.promotion_id
    join customers c on c.id = cl.customer_id;
$$;

-- Esito di una consegna; 4 errori consecutivi = fallita. Restituisce il riepilogo della
-- promozione se con questa consegna è completata (nessuna più in attesa).
create or replace function promotion_delivery_record(
  p_promotion_id uuid, p_customer_id uuid, p_status text, p_error_code text, p_error text, p_skip_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  schedule constant int[] := array[1, 5, 15];
  v_attempts int;
  v_pending int;
begin
  if p_status = 'failed' then
    update promotion_deliveries
       set attempts = attempts + 1, error_code = p_error_code, error = left(p_error, 1000), updated_at = now(),
           status = case when attempts + 1 > array_length(schedule, 1) then 'failed' else 'pending' end,
           next_attempt_at = now() + make_interval(mins => schedule[least(attempts + 1, array_length(schedule, 1))])
     where promotion_id = p_promotion_id and customer_id = p_customer_id
    returning attempts into v_attempts;
  else
    update promotion_deliveries
       set status = p_status, skip_reason = p_skip_reason, sent_at = case when p_status = 'sent' then now() end,
           updated_at = now()
     where promotion_id = p_promotion_id and customer_id = p_customer_id;
  end if;

  select count(*) into v_pending from promotion_deliveries where promotion_id = p_promotion_id and status = 'pending';
  if v_pending > 0 then
    return jsonb_build_object('completed', false);
  end if;

  update promotions set status = 'sent', sent_at = now() where id = p_promotion_id and status = 'sending';
  if not found then
    return jsonb_build_object('completed', false);  -- già chiusa da un'altra esecuzione
  end if;
  return (
    select jsonb_build_object(
      'completed', true,
      'sent', count(*) filter (where status = 'sent'),
      'skipped', count(*) filter (where status = 'skipped'),
      'failed', count(*) filter (where status = 'failed'))
      from promotion_deliveries where promotion_id = p_promotion_id
  );
end;
$$;

-- promozione senza destinatari al momento dell'invio (consensi revocati dopo la prenotazione)
create or replace function promotions_close_empty()
returns setof promotions
language sql
security definer
set search_path = public
as $$
  update promotions p set status = 'sent', sent_at = now()
   where p.status = 'sending'
     and not exists (select 1 from promotion_deliveries d where d.promotion_id = p.id)
  returning p.*;
$$;

revoke all on function promotions_prepare() from public, anon, authenticated;
revoke all on function promotion_deliveries_claim(int) from public, anon, authenticated;
revoke all on function promotion_delivery_record(uuid, uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function promotions_close_empty() from public, anon, authenticated;
