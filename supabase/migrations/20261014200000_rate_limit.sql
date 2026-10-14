-- =============================================================
-- Rate limit delle API (finestra fissa di 60 s) in Postgres.
-- Tabella UNLOGGED: veloce, e dopo un crash si riparte da zero,
-- che per dei contatori al minuto va benissimo.
-- =============================================================

create unlogged table rate_limit_counters (
  key          text        not null,
  window_start timestamptz not null,
  hits         int         not null default 0,
  primary key (key, window_start)
);

alter table rate_limit_counters enable row level security;

-- Conta una richiesta per la chiave e dice se è sotto il limite.
-- Ogni tanto (circa 1 chiamata su 100) cancella le finestre vecchie.
create or replace function rate_limit_hit(p_key text, p_limit int, p_window_seconds int default 60)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_hits int;
begin
  insert into rate_limit_counters as r (key, window_start, hits)
  values (p_key, v_window, 1)
  on conflict (key, window_start) do update set hits = r.hits + 1
  returning hits into v_hits;

  if random() < 0.01 then
    delete from rate_limit_counters where window_start < now() - interval '10 minutes';
  end if;

  return jsonb_build_object(
    'allowed', v_hits <= p_limit,
    'hits', v_hits,
    'limit', p_limit,
    'retry_after', ceil(extract(epoch from (v_window + make_interval(secs => p_window_seconds) - now())))::int
  );
end;
$$;

revoke all on function rate_limit_hit(text, int, int) from public, anon, authenticated;
