-- =============================================================
-- Query dell'app esercente: statistiche del negozio e ricerca clienti.
-- =============================================================

create extension if not exists pg_trgm with schema extensions;

-- ricerca per nome (ILIKE '%…%') tra i clienti attivi
create index customers_name_trgm_idx on customers using gin (name extensions.gin_trgm_ops) where deleted_at is null;

-- Statistiche per la dashboard del titolare. Settimane ISO (da lunedì) in ora italiana.
create or replace function shop_stats(p_shop_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with
  week0 as (select date_trunc('week', now() at time zone 'Europe/Rome') as start),
  weeks as (
    select (select start from week0) - make_interval(weeks => g) as week_start
    from generate_series(7, 0, -1) as g
  ),
  ev as (
    select date_trunc('week', created_at at time zone 'Europe/Rome') as week_start, kind
    from stamp_events
    where shop_id = p_shop_id and undone_at is null and kind in ('stamp', 'redeem')
      and created_at >= ((select start from week0) - interval '7 weeks') at time zone 'Europe/Rome'
  ),
  enr as (
    select date_trunc('week', created_at at time zone 'Europe/Rome') as week_start
    from customers
    where shop_id = p_shop_id
      and created_at >= ((select start from week0) - interval '7 weeks') at time zone 'Europe/Rome'
  ),
  last_activity as (
    select c.id, greatest(c.created_at, max(e.created_at)) as last_at
    from customers c
    left join stamp_events e on e.customer_id = c.id and e.undone_at is null
    where c.shop_id = p_shop_id and c.deleted_at is null
    group by c.id, c.created_at
  )
  select jsonb_build_object(
    'customers_total', (select count(*) from customers where shop_id = p_shop_id and deleted_at is null),
    'customers_marketing', (select count(*) from customers where shop_id = p_shop_id and deleted_at is null and consent_marketing),
    'inactive_60_days', (select count(*) from last_activity where last_at < now() - interval '60 days'),
    'weeks', (
      select jsonb_agg(jsonb_build_object(
        'week_start', to_char(w.week_start, 'YYYY-MM-DD'),
        'stamps', (select count(*) from ev where ev.week_start = w.week_start and kind = 'stamp'),
        'redeems', (select count(*) from ev where ev.week_start = w.week_start and kind = 'redeem'),
        'enrollments', (select count(*) from enr where enr.week_start = w.week_start)
      ) order by w.week_start)
      from weeks w
    )
  );
$$;

revoke all on function shop_stats(uuid) from public, anon, authenticated;
