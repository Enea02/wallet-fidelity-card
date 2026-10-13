-- =============================================================
-- Loyalty Wallet — schema multi-tenant (Supabase / Postgres)
-- Eseguire nell'SQL editor di Supabase.
-- Tutte le tabelle hanno RLS attiva SENZA policy: vi accede solo
-- il backend con la service role key. Il client non legge mai il DB.
-- =============================================================

create extension if not exists pgcrypto;

-- Negozio (tenant) e configurazione del programma timbri
create table if not exists shops (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null unique check (slug ~ '^[a-z0-9-]{3,40}$'),
  name             text not null,
  stamps_required  int  not null default 10 check (stamps_required between 2 and 50),
  reward_label     text not null default 'Taglio gratis',
  logo_url         text,            -- PNG pubblico, quadrato, min 660x660 (Google)
  hex_color        text not null default '#1f2937' check (hex_color ~ '^#[0-9a-fA-F]{6}$'),
  created_at       timestamptz not null default now()
);

-- Cliente finale iscritto a un negozio
create table if not exists customers (
  id                 uuid primary key default gen_random_uuid(),
  shop_id            uuid not null references shops(id) on delete cascade,
  name               text not null,
  phone              text not null,
  consent_privacy    boolean not null check (consent_privacy),
  consent_marketing  boolean not null default false,
  -- valore del QR sul pass: casuale, non indovinabile, mai l'id interno
  qr_token           text not null unique default encode(gen_random_bytes(16), 'hex'),
  stamps             int  not null default 0 check (stamps >= 0),
  rewards_available  int  not null default 0 check (rewards_available >= 0),
  created_at         timestamptz not null default now(),
  unique (shop_id, phone)
);

-- Utenti staff (Supabase Auth) abilitati a timbrare per un negozio
create table if not exists staff (
  user_id  uuid not null references auth.users(id) on delete cascade,
  shop_id  uuid not null references shops(id) on delete cascade,
  primary key (user_id, shop_id)
);

-- Storico di timbri e riscatti (audit, statistiche, anti-abuso)
create table if not exists stamp_events (
  id             bigint generated always as identity primary key,
  shop_id        uuid not null references shops(id) on delete cascade,
  customer_id    uuid not null references customers(id) on delete cascade,
  staff_user_id  uuid references auth.users(id) on delete set null,
  kind           text not null check (kind in ('stamp', 'redeem')),
  created_at     timestamptz not null default now()
);
create index if not exists stamp_events_customer_idx on stamp_events (customer_id, created_at desc);

-- Registrazioni dispositivi Apple Wallet (usata quando si attiva Apple)
create table if not exists apple_registrations (
  device_library_id  text not null,
  push_token         text not null,
  customer_id        uuid not null references customers(id) on delete cascade,
  created_at         timestamptz not null default now(),
  primary key (device_library_id, customer_id)
);

alter table shops               enable row level security;
alter table customers           enable row level security;
alter table staff               enable row level security;
alter table stamp_events        enable row level security;
alter table apple_registrations enable row level security;

-- -------------------------------------------------------------
-- Timbro atomico: incrementa, e al raggiungimento della soglia
-- azzera i timbri e accredita un premio. Lock di riga = niente
-- doppi timbri da due scansioni concorrenti.
-- -------------------------------------------------------------
create or replace function add_stamp(p_customer_id uuid, p_staff_user_id uuid)
returns table (stamps int, rewards_available int, reward_unlocked boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_required int;
  v_shop     uuid;
  v_stamps   int;
  v_rewards  int;
  v_unlocked boolean := false;
begin
  select c.shop_id, c.stamps, c.rewards_available, s.stamps_required
    into v_shop, v_stamps, v_rewards, v_required
    from customers c join shops s on s.id = c.shop_id
   where c.id = p_customer_id
   for update of c;

  if not found then
    raise exception 'customer_not_found';
  end if;

  v_stamps := v_stamps + 1;
  if v_stamps >= v_required then
    v_stamps   := 0;
    v_rewards  := v_rewards + 1;
    v_unlocked := true;
  end if;

  update customers
     set stamps = v_stamps, rewards_available = v_rewards
   where id = p_customer_id;

  insert into stamp_events (shop_id, customer_id, staff_user_id, kind)
  values (v_shop, p_customer_id, p_staff_user_id, 'stamp');

  return query select v_stamps, v_rewards, v_unlocked;
end;
$$;

-- Riscatto atomico di un premio
create or replace function redeem_reward(p_customer_id uuid, p_staff_user_id uuid)
returns table (stamps int, rewards_available int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shop    uuid;
  v_stamps  int;
  v_rewards int;
begin
  select c.shop_id, c.stamps, c.rewards_available
    into v_shop, v_stamps, v_rewards
    from customers c
   where c.id = p_customer_id
   for update;

  if not found then
    raise exception 'customer_not_found';
  end if;
  if v_rewards < 1 then
    raise exception 'no_reward_available';
  end if;

  v_rewards := v_rewards - 1;
  update customers set rewards_available = v_rewards where id = p_customer_id;

  insert into stamp_events (shop_id, customer_id, staff_user_id, kind)
  values (v_shop, p_customer_id, p_staff_user_id, 'redeem');

  return query select v_stamps, v_rewards;
end;
$$;

revoke all on function add_stamp(uuid, uuid)     from public, anon, authenticated;
revoke all on function redeem_reward(uuid, uuid) from public, anon, authenticated;

-- -------------------------------------------------------------
-- Dati di esempio (decommentare e adattare)
-- -------------------------------------------------------------
-- insert into shops (slug, name, stamps_required, reward_label, logo_url, hex_color)
-- values ('salone-mario', 'Salone Mario', 10, 'Taglio gratis',
--         'https://esempio.it/logo.png', '#7c3aed');
--
-- Dopo aver creato l'utente staff da Supabase > Authentication:
-- insert into staff (user_id, shop_id)
-- select '<uuid-utente-auth>', id from shops where slug = 'salone-mario';
