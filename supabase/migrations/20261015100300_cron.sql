-- =============================================================
-- Cron ogni minuto: pg_cron chiama POST /api/internal/cron/wallet-sync
-- con pg_net (nuovi tentativi, riconciliazione, invio promozioni).
-- URL e segreto stanno nel Vault di Supabase e si impostano con
-- configure_wallet_cron(): in locale lo fa `pnpm db:start`, in
-- produzione `pnpm cron:configure` (vedi README). Senza configurazione
-- il job non fa nulla.
-- =============================================================

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create or replace function configure_wallet_cron(p_url text, p_secret text)
returns void
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_id uuid;
begin
  select id into v_id from vault.secrets where name = 'wallet_cron_url';
  if v_id is null then perform vault.create_secret(p_url, 'wallet_cron_url'); else perform vault.update_secret(v_id, p_url); end if;
  select id into v_id from vault.secrets where name = 'wallet_cron_secret';
  if v_id is null then perform vault.create_secret(p_secret, 'wallet_cron_secret'); else perform vault.update_secret(v_id, p_secret); end if;
end;
$$;

-- Chiamata dal job: legge URL e segreto dal Vault e invia la richiesta (asincrona).
create or replace function wallet_cron_tick()
returns void
language plpgsql
security definer
set search_path = public, vault, extensions
as $$
declare
  v_url text;
  v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'wallet_cron_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'wallet_cron_secret';
  if v_url is null or v_secret is null then
    return;
  end if;
  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('authorization', 'Bearer ' || v_secret, 'content-type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
end;
$$;

-- Accende/spegne il job (i test lo spengono per non essere disturbati dal server di sviluppo).
create or replace function set_wallet_cron_active(p_active boolean)
returns void
language sql
security definer
set search_path = public, cron
as $$
  select cron.alter_job(jobid, active := p_active) from cron.job where jobname = 'wallet-sync';
$$;

select cron.schedule('wallet-sync', '* * * * *', 'select public.wallet_cron_tick()');

revoke all on function configure_wallet_cron(text, text) from public, anon, authenticated;
revoke all on function wallet_cron_tick() from public, anon, authenticated;
revoke all on function set_wallet_cron_active(boolean) from public, anon, authenticated;
