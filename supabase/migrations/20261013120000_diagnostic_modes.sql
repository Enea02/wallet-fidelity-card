-- =============================================================
-- Modalità diagnostica: log debug/trace (con payload) per un solo
-- negozio, utente staff o cliente, con scadenza automatica.
-- Letta dal server con cache di 30 s; attivata dal team (oggi con
-- `pnpm diag`, dalla Fase 9 dal pannello interno).
-- =============================================================

create table diagnostic_modes (
  id                uuid primary key default gen_random_uuid(),
  scope_type        text not null check (scope_type in ('shop', 'staff_user', 'customer')),
  scope_id          uuid not null,
  -- nome leggibile per i log (slug, email, codice carta): niente dati personali sensibili
  scope_label       text not null,
  level             text not null default 'debug' check (level in ('debug', 'trace')),
  reason            text not null check (length(trim(reason)) >= 5),
  enabled_by        text not null check (length(trim(enabled_by)) > 0),
  enabled_at        timestamptz not null default now(),
  expires_at        timestamptz not null,
  disabled_at       timestamptz,
  disabled_by       text,
  -- valorizzato quando il server registra la scadenza (diagnostic.mode.expired), una volta sola
  expired_logged_at timestamptz,
  constraint diagnostic_modes_duration check (
    expires_at > enabled_at and expires_at <= enabled_at + interval '7 days'
  ),
  constraint diagnostic_modes_disabled check ((disabled_at is null) = (disabled_by is null))
);

-- le modalità "aperte" sono poche: il server le legge tutte
create index diagnostic_modes_open_idx
  on diagnostic_modes (expires_at)
  where disabled_at is null and expired_logged_at is null;

alter table diagnostic_modes enable row level security;

-- Attiva la modalità diagnostica (default 24 ore, massimo 7 giorni).
create or replace function enable_diagnostic_mode(
  p_scope_type  text,
  p_scope_id    uuid,
  p_scope_label text,
  p_reason      text,
  p_enabled_by  text,
  p_level       text default 'debug',
  p_hours       int  default 24
)
returns setof diagnostic_modes
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_hours < 1 or p_hours > 168 then
    raise exception 'diagnostic_duration_out_of_range' using detail = 'durata tra 1 e 168 ore';
  end if;

  return query
  insert into diagnostic_modes (scope_type, scope_id, scope_label, level, reason, enabled_by, expires_at)
  values (p_scope_type, p_scope_id, p_scope_label, p_level, p_reason, p_enabled_by,
          now() + make_interval(hours => p_hours))
  returning *;
end;
$$;

-- Spegne a mano una modalità ancora aperta; nessuna riga se era già chiusa.
create or replace function disable_diagnostic_mode(p_id uuid, p_disabled_by text)
returns setof diagnostic_modes
language sql
security definer
set search_path = public
as $$
  update diagnostic_modes
     set disabled_at = now(), disabled_by = p_disabled_by
   where id = p_id and disabled_at is null and expired_logged_at is null
  returning *;
$$;

-- Chiude le modalità scadute e restituisce SOLO quelle chiuse da questa chiamata:
-- con più istanze del server ognuna scadenza viene registrata una volta sola.
create or replace function close_expired_diagnostic_modes()
returns setof diagnostic_modes
language sql
security definer
set search_path = public
as $$
  update diagnostic_modes
     set expired_logged_at = now()
   where disabled_at is null and expired_logged_at is null and expires_at <= now()
  returning *;
$$;

revoke all on function enable_diagnostic_mode(text, uuid, text, text, text, text, int) from public, anon, authenticated;
revoke all on function disable_diagnostic_mode(uuid, text) from public, anon, authenticated;
revoke all on function close_expired_diagnostic_modes() from public, anon, authenticated;
