-- =============================================================
-- Pacchetti "Invia diagnostica all'assistenza" dalle app:
-- buffer degli ultimi eventi + informazioni sul dispositivo.
-- Il codice ticket è quello che l'esercente ci comunica.
-- (Conservazione 90 giorni: job di pulizia in Fase 10.)
-- =============================================================

create table diagnostic_bundles (
  id          uuid primary key default gen_random_uuid(),
  ticket_code text not null unique default ('DIAG-' || generate_short_code()),
  shop_id     uuid references shops(id) on delete cascade,
  user_id     uuid references auth.users(id) on delete set null,
  request_id  text,
  platform    text,
  app_version text,
  size_bytes  int  not null,
  device      jsonb not null default '{}',
  events      jsonb not null default '[]',
  note        text,
  created_at  timestamptz not null default now()
);

create index diagnostic_bundles_shop_created_idx on diagnostic_bundles (shop_id, created_at desc);
alter table diagnostic_bundles enable row level security;
