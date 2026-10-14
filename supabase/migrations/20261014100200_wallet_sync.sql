-- =============================================================
-- Stato di sincronizzazione delle carte con Google e Apple Wallet.
-- Solo schema: le scrive notifyCardChanged dalla Fase 4.
-- Risponde a "la carta del cliente non si aggiorna": cosa abbiamo
-- inviato, cosa ha risposto il wallet e quando.
-- =============================================================

create table wallet_sync_state (
  customer_id            uuid not null references customers(id) on delete cascade,
  wallet                 text not null check (wallet in ('google', 'apple')),
  shop_id                uuid not null references shops(id) on delete cascade,
  -- ultimo stato inviato con successo
  synced_stamps          int,
  synced_rewards         int,
  synced_state           text check (synced_state in ('ACTIVE', 'INACTIVE')),
  last_attempt_at        timestamptz,
  last_success_at        timestamptz,
  last_error_at          timestamptz,
  last_error_code        text,
  last_error             text,
  -- tentativi falliti consecutivi (0 = allineata)
  attempts               int not null default 0,
  request_id             text,
  -- solo Apple
  apple_devices          int,
  apple_last_download_at timestamptz,
  updated_at             timestamptz not null default now(),
  primary key (customer_id, wallet)
);

create table wallet_sync_failures (
  id            bigint generated always as identity primary key,
  customer_id   uuid not null references customers(id) on delete cascade,
  wallet        text not null check (wallet in ('google', 'apple')),
  shop_id       uuid not null references shops(id) on delete cascade,
  request_id    text,
  error_code    text not null,
  error         text,
  attempt       int not null default 1,
  next_retry_at timestamptz,
  resolved_at   timestamptz,
  exhausted_at  timestamptz,
  created_at    timestamptz not null default now()
);

create index wallet_sync_failures_pending_idx
  on wallet_sync_failures (next_retry_at)
  where resolved_at is null and exhausted_at is null;

alter table wallet_sync_state    enable row level security;
alter table wallet_sync_failures enable row level security;
