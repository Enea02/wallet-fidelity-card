-- =============================================================
-- Promozioni: prenotazione dell'invio (l'invio reale ai wallet è
-- della Fase 4). Una promozione a settimana per negozio, solo ai
-- clienti con consenso marketing.
-- =============================================================

create table promotions (
  id                   uuid primary key default gen_random_uuid(),
  shop_id              uuid not null references shops(id) on delete cascade,
  body                 text not null check (length(trim(body)) between 1 and 140),
  status               text not null default 'queued' check (status in ('queued', 'sending', 'sent', 'cancelled')),
  recipients_estimated int  not null,
  created_by           uuid references auth.users(id) on delete set null,
  request_id           text,
  created_at           timestamptz not null default now(),
  sent_at              timestamptz
);

create index promotions_shop_created_idx on promotions (shop_id, created_at desc);
alter table promotions enable row level security;

create or replace function queue_promotion(p_shop_id uuid, p_body text, p_meta jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor staff;
  v_last timestamptz;
  v_recipients int;
  v_promo promotions;
begin
  v_actor := _require_staff(p_meta, p_shop_id, true);
  perform 1 from shops where id = p_shop_id for update;  -- serializza due prenotazioni concorrenti

  select max(created_at) into v_last from promotions where shop_id = p_shop_id and status <> 'cancelled';
  if v_last is not null and v_last > now() - interval '7 days' then
    perform _raise('E_PROMO_WEEKLY_LIMIT', jsonb_build_object(
      'last_at', v_last, 'next_allowed_at', v_last + interval '7 days'));
  end if;

  select count(*) into v_recipients
    from customers where shop_id = p_shop_id and deleted_at is null and consent_marketing;
  if v_recipients = 0 then
    perform _raise('E_PROMO_NO_RECIPIENTS');
  end if;

  insert into promotions (shop_id, body, recipients_estimated, created_by, request_id)
  values (p_shop_id, trim(p_body), v_recipients, v_actor.user_id, p_meta->>'request_id')
  returning * into v_promo;

  perform _audit(p_meta, p_shop_id, 'promo_send', 'promotion', v_promo.id::text, null,
                 jsonb_build_object('body', v_promo.body, 'recipients_estimated', v_recipients, 'status', 'queued'));
  return jsonb_build_object('promotion_id', v_promo.id, 'recipients_estimated', v_recipients,
                            'created_at', v_promo.created_at)
      || _staff_json(v_actor);
end;
$$;

revoke all on function queue_promotion(uuid, text, jsonb) from public, anon, authenticated;
