-- =============================================================
-- Iscrizione dal web pubblico con verifica del telefono (OTP via SMS).
-- - enrollment_sessions: iscrizioni in corso (15 minuti), con nome e
--   telefono in chiaro solo finché servono; cancellate dopo 24 ore;
-- - otp_sends: ogni SMS inviato, con il telefono SOLO come hash: serve
--   ai limiti per numero e per IP;
-- - otp_blocks: numeri bloccati 15 minuti dopo 5 codici sbagliati.
-- Limiti passati dal backend (p_limits), con default sicuri.
-- =============================================================

-- testi del negozio dal design: frase d'apertura e icona dei timbri
alter table shops
  add column tagline    text check (tagline is null or length(trim(tagline)) between 4 and 80),
  add column stamp_icon text not null default 'check'
    check (stamp_icon in ('scissors', 'cup', 'pizza', 'sparkle', 'gift', 'check'));

create table enrollment_sessions (
  id                uuid primary key default gen_random_uuid(),
  shop_id           uuid not null references shops(id) on delete cascade,
  phone             text,
  phone_hash        text not null,
  name              text,
  consent_marketing boolean not null default false,
  ip_hash           text,
  sends             int  not null default 0,
  last_sent_at      timestamptz,
  verify_attempts   int  not null default 0,
  status            text not null default 'pending' check (status in ('pending', 'verified', 'blocked')),
  customer_id       uuid references customers(id) on delete set null,
  created_at        timestamptz not null default now(),
  expires_at        timestamptz not null default now() + interval '15 minutes'
);
create index enrollment_sessions_created_idx on enrollment_sessions (created_at);

create table otp_sends (
  id         bigint generated always as identity primary key,
  session_id uuid references enrollment_sessions(id) on delete set null,
  phone_hash text not null,
  ip_hash    text,
  sent_at    timestamptz not null default now()
);
create index otp_sends_phone_idx on otp_sends (phone_hash, sent_at desc);
create index otp_sends_ip_idx on otp_sends (ip_hash, sent_at desc);

create table otp_blocks (
  phone_hash    text primary key,
  blocked_until timestamptz not null
);

alter table enrollment_sessions enable row level security;
alter table otp_sends enable row level security;
alter table otp_blocks enable row level security;

-- Controlla i limiti e registra un invio (prima di chiamare Twilio). Lock per numero:
-- due richieste contemporanee con lo stesso telefono non superano mai il limite.
create or replace function _otp_reserve_send(p_session_id uuid, p_phone_hash text, p_ip_hash text, p_limits jsonb)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_until timestamptz;
  v_hour int;
  v_day int;
  v_ip int;
begin
  perform pg_advisory_xact_lock(hashtext('otp:' || p_phone_hash));
  select blocked_until into v_until from otp_blocks where phone_hash = p_phone_hash and blocked_until > now();
  if found then
    perform _raise('E_OTP_LIMIT', jsonb_build_object('scope', 'numero bloccato',
      'retry_after_min', ceil(extract(epoch from (v_until - now())) / 60)::int));
  end if;
  select count(*) filter (where sent_at > now() - interval '1 hour'), count(*)
    into v_hour, v_day
    from otp_sends where phone_hash = p_phone_hash and sent_at > now() - interval '1 day';
  if v_hour >= coalesce((p_limits->>'per_number_hour')::int, 3) then
    perform _raise('E_OTP_LIMIT', jsonb_build_object('scope', 'numero', 'retry_after_min', 60));
  end if;
  if v_day >= coalesce((p_limits->>'per_number_day')::int, 5) then
    perform _raise('E_OTP_LIMIT', jsonb_build_object('scope', 'numero (giornaliero)', 'retry_after_min', 1440));
  end if;
  if p_ip_hash is not null then
    perform pg_advisory_xact_lock(hashtext('otp-ip:' || p_ip_hash));
    select count(*) into v_ip from otp_sends where ip_hash = p_ip_hash and sent_at > now() - interval '1 hour';
    if v_ip >= coalesce((p_limits->>'per_ip_hour')::int, 10) then
      perform _raise('E_OTP_LIMIT', jsonb_build_object('scope', 'IP', 'retry_after_min', 60));
    end if;
  end if;
  insert into otp_sends (session_id, phone_hash, ip_hash) values (p_session_id, p_phone_hash, p_ip_hash);
end;
$$;

create or replace function enrollment_start(
  p_shop_id uuid, p_phone text, p_phone_hash text, p_name text, p_consent_marketing boolean,
  p_ip_hash text, p_limits jsonb default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := gen_random_uuid();
begin
  insert into enrollment_sessions (id, shop_id, phone, phone_hash, name, consent_marketing, ip_hash, sends, last_sent_at)
  values (v_id, p_shop_id, p_phone, p_phone_hash, p_name, coalesce(p_consent_marketing, false), p_ip_hash, 1, now());
  perform _otp_reserve_send(v_id, p_phone_hash, p_ip_hash, p_limits);
  return jsonb_build_object('enrollment_id', v_id, 'expires_at', now() + interval '15 minutes');
end;
$$;

-- Nuovo codice: solo dopo 60 secondi dal precedente, con gli stessi limiti.
create or replace function enrollment_resend(p_id uuid, p_ip_hash text, p_limits jsonb default '{}')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_s enrollment_sessions;
  v_wait int;
begin
  select * into v_s from enrollment_sessions where id = p_id for update;
  if not found or v_s.status <> 'pending' or v_s.expires_at < now() then
    perform _raise('E_OTP_EXPIRED', jsonb_build_object('enrollment_id', p_id));
  end if;
  v_wait := 60 - floor(extract(epoch from (now() - v_s.last_sent_at)))::int;
  if v_wait > 0 then
    perform _raise('E_OTP_RESEND_TOO_SOON', jsonb_build_object('seconds_left', v_wait));
  end if;
  perform _otp_reserve_send(p_id, v_s.phone_hash, p_ip_hash, p_limits);
  update enrollment_sessions
     set sends = sends + 1, last_sent_at = now(), expires_at = now() + interval '15 minutes'
   where id = p_id;
  return jsonb_build_object('send_number', v_s.sends + 1, 'phone', v_s.phone, 'shop_id', v_s.shop_id);
end;
$$;

-- Invio fallito presso il fornitore SMS: l'invio non conta per i limiti.
create or replace function enrollment_send_failed(p_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  delete from otp_sends where id = (select max(id) from otp_sends where session_id = p_id);
$$;

-- Iscrizione in corso, se ancora valida (prima di controllare il codice).
create or replace function enrollment_get(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_s enrollment_sessions;
begin
  select * into v_s from enrollment_sessions where id = p_id;
  if not found or v_s.expires_at < now() or v_s.status = 'verified' then
    perform _raise('E_OTP_EXPIRED', jsonb_build_object('enrollment_id', p_id));
  end if;
  if v_s.status = 'blocked' or exists (select 1 from otp_blocks where phone_hash = v_s.phone_hash and blocked_until > now()) then
    perform _raise('E_OTP_TOO_MANY_ATTEMPTS', jsonb_build_object('blocked_min', 15));
  end if;
  return to_jsonb(v_s) - 'phone_hash' - 'ip_hash';
end;
$$;

-- Esito del controllo del codice. Al 5° errore: iscrizione e numero bloccati per 15 minuti.
create or replace function enrollment_record_check(p_id uuid, p_ok boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_s enrollment_sessions;
  max_attempts constant int := 5;
begin
  select * into v_s from enrollment_sessions where id = p_id for update;
  if not found or v_s.status <> 'pending' then
    perform _raise('E_OTP_EXPIRED', jsonb_build_object('enrollment_id', p_id));
  end if;
  if p_ok then
    return jsonb_build_object('ok', true, 'attempts', v_s.verify_attempts + 1);
  end if;
  update enrollment_sessions set verify_attempts = verify_attempts + 1 where id = p_id;
  if v_s.verify_attempts + 1 >= max_attempts then
    update enrollment_sessions set status = 'blocked' where id = p_id;
    insert into otp_blocks (phone_hash, blocked_until) values (v_s.phone_hash, now() + interval '15 minutes')
    on conflict (phone_hash) do update set blocked_until = excluded.blocked_until;
    return jsonb_build_object('ok', false, 'attempts_left', 0, 'blocked_min', 15);
  end if;
  return jsonb_build_object('ok', false, 'attempts_left', max_attempts - v_s.verify_attempts - 1);
end;
$$;

-- Iscrizione completata: si tengono solo gli esiti, nome e telefono vengono tolti.
create or replace function enrollment_complete(p_id uuid, p_customer_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update enrollment_sessions
     set status = 'verified', customer_id = p_customer_id, phone = null, name = null
   where id = p_id;
$$;

-- Pulizia (dal cron): iscrizioni e invii vecchi, blocchi scaduti.
create or replace function enrollment_cleanup()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sessions int;
  v_sends int;
begin
  delete from enrollment_sessions where created_at < now() - interval '24 hours';
  get diagnostics v_sessions = row_count;
  delete from otp_sends where sent_at < now() - interval '2 days';
  get diagnostics v_sends = row_count;
  delete from otp_blocks where blocked_until < now();
  return jsonb_build_object('sessions', v_sessions, 'sends', v_sends);
end;
$$;

revoke all on function _otp_reserve_send(uuid, text, text, jsonb) from public, anon, authenticated;
revoke all on function enrollment_start(uuid, text, text, text, boolean, text, jsonb) from public, anon, authenticated;
revoke all on function enrollment_resend(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function enrollment_send_failed(uuid) from public, anon, authenticated;
revoke all on function enrollment_get(uuid) from public, anon, authenticated;
revoke all on function enrollment_record_check(uuid, boolean) from public, anon, authenticated;
revoke all on function enrollment_complete(uuid, uuid) from public, anon, authenticated;
revoke all on function enrollment_cleanup() from public, anon, authenticated;
