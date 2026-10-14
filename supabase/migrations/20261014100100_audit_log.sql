-- =============================================================
-- Audit di dominio: storico permanente (24 mesi) di chi ha fatto cosa.
-- Scritto SOLO dalle funzioni di dominio, nella stessa transazione
-- dell'operazione: non può esistere un timbro senza la sua traccia.
-- Append-only: un trigger blocca update, delete e truncate.
-- =============================================================

create table audit_log (
  id          bigint generated always as identity primary key,
  ts          timestamptz not null default now(),
  request_id  text,
  shop_id     uuid references shops(id) on delete cascade,
  actor_type  text not null check (actor_type in ('staff', 'customer', 'system', 'support')),
  actor_id    text,
  action      text not null check (action ~ '^[a-z_]+$'),
  entity      text not null,
  entity_id   text,
  before      jsonb,
  after       jsonb,
  reason      text,
  platform    text,
  app_version text,
  ip_hash     text
);

alter table audit_log enable row level security;

-- Uniche eccezioni, attivate da un flag valido solo nella transazione corrente:
-- - app.audit_pseudonymize = on (delete_customer): si possono togliere dati personali
--   da before/after, senza toccare nient'altro;
-- - app.audit_purge = on (retention e cancellazione negozio, fasi successive): delete.
create or replace function audit_log_append_only()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and current_setting('app.audit_pseudonymize', true) = 'on'
     and new.id = old.id and new.ts = old.ts
     and new.request_id is not distinct from old.request_id
     and new.shop_id is not distinct from old.shop_id
     and new.actor_type = old.actor_type
     and new.actor_id is not distinct from old.actor_id
     and new.action = old.action
     and new.entity = old.entity
     and new.entity_id is not distinct from old.entity_id
     and new.reason is not distinct from old.reason then
    return new;
  end if;
  if tg_op = 'DELETE' and current_setting('app.audit_purge', true) = 'on' then
    return old;
  end if;
  raise exception 'E_AUDIT_IMMUTABLE'
    using detail = json_build_object('operation', tg_op)::text,
          hint = 'audit_log è append-only: si scrive solo dalle funzioni di dominio';
end;
$$;

create trigger audit_log_append_only
  before update or delete on audit_log
  for each row execute function audit_log_append_only();

create trigger audit_log_no_truncate
  before truncate on audit_log
  for each statement execute function audit_log_append_only();
