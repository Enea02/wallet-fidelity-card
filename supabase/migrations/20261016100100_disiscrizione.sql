-- =============================================================
-- Disiscrizione dalle promozioni con link firmato e monouso:
-- si salva solo l'impronta del token già usato.
-- =============================================================

create table unsubscribe_tokens_used (
  token_hash   text primary key,
  customer_id  uuid not null references customers(id) on delete cascade,
  promotion_id uuid,
  used_at      timestamptz not null default now()
);
alter table unsubscribe_tokens_used enable row level security;

-- Usa il token (una volta sola) e revoca il consenso con attore "cliente" (finisce in audit_log).
create or replace function unsubscribe_with_token(p_token_hash text, p_customer_id uuid, p_promotion_id uuid, p_meta jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  insert into unsubscribe_tokens_used (token_hash, customer_id, promotion_id)
  values (p_token_hash, p_customer_id, p_promotion_id)
  on conflict (token_hash) do nothing;
  if not found then
    return jsonb_build_object('already_used', true);
  end if;
  v_result := set_marketing_consent(p_customer_id, false,
    p_meta || jsonb_build_object('actor_type', 'customer', 'actor_id', p_customer_id));
  return v_result || jsonb_build_object('already_used', false);
end;
$$;

revoke all on function unsubscribe_with_token(text, uuid, uuid, jsonb) from public, anon, authenticated;
