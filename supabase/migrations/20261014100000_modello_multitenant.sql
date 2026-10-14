-- =============================================================
-- Fase 2 — modello dati multi-tenant: ruoli dello staff, regole e
-- stato del negozio, codice breve e cancellazione dei clienti.
-- =============================================================

-- Staff: ruolo e nome mostrato nei log e nell'app ("Giulia (operatore, iOS) …")
alter table staff
  add column role         text not null default 'operator' check (role in ('owner', 'operator')),
  add column display_name text not null default 'Staff' check (length(trim(display_name)) > 0);

-- Negozio: cooldown tra due timbri, stato, dati del titolare per l'informativa privacy
alter table shops
  add column stamp_cooldown_minutes int  not null default 60 check (stamp_cooldown_minutes between 0 and 1440),
  add column status                 text not null default 'active' check (status in ('active', 'suspended')),
  add column legal_name             text,
  add column vat_number             text,
  add column privacy_email          text;

-- Codice breve della carta: 8 caratteri senza simboli ambigui (niente 0/O, 1/I/L),
-- stampato sotto il QR e usato come customer_ref nei log.
create or replace function generate_short_code()
returns text
language plpgsql
volatile
set search_path = public, extensions
as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  bytes bytea := gen_random_bytes(8);
  code  text  := '';
begin
  for i in 0..7 loop
    code := code || substr(alphabet, (get_byte(bytes, i) % length(alphabet)) + 1, 1);
  end loop;
  return code;
end;
$$;

alter table customers
  add column short_code text,
  add column deleted_at timestamptz;

update customers set short_code = generate_short_code() where short_code is null;

alter table customers
  alter column short_code set not null,
  alter column short_code set default generate_short_code(),
  add constraint customers_short_code_format check (short_code ~ '^[2-9A-HJKMNP-Z]{8}$'),
  add constraint customers_shop_short_code_key unique (shop_id, short_code);

-- Cancellazione: la riga resta (id, conteggi, storico) ma senza dati personali.
-- Telefono annullabile; l'unicità per negozio vale solo tra i clienti attivi,
-- così lo stesso numero può reiscriversi come cliente nuovo.
alter table customers
  alter column phone drop not null,
  drop constraint customers_shop_id_phone_key,
  drop constraint customers_consent_privacy_check,
  add constraint customers_consent_privacy_check check (consent_privacy or deleted_at is not null),
  add constraint customers_deleted_no_personal_data check (deleted_at is null or phone is null);

create unique index customers_shop_phone_active_key on customers (shop_id, phone) where deleted_at is null;

-- Storico per le statistiche: rettifiche e timbri annullati (esclusi dai conteggi).
-- stamps_before / rewards_before servono all'annullamento per ripristinare lo stato esatto.
alter table stamp_events
  drop constraint stamp_events_kind_check,
  add constraint stamp_events_kind_check check (kind in ('stamp', 'redeem', 'adjust')),
  add column stamps_before   int,
  add column rewards_before  int,
  add column reward_unlocked boolean not null default false,
  add column undone_at       timestamptz,
  add column undone_by       uuid references auth.users(id) on delete set null;
