-- Pannello interno: dati di sola lettura per la Panoramica, l'elenco dei negozi a card e la scheda negozio.
-- Nessuna modifica: solo viste e funzioni STABLE, chiamate dal server (service role) dopo il controllo
-- team + 2FA di supportPage. Le date dei grafici sono giorni di calendario in Europe/Rome.

-- Attività in cassa: timbri, punti dati per uno scontrino, scali dalle tessere (annullati esclusi).
create or replace view support_activity
with (security_invoker = true) as
  select shop_id, created_at as at, 'timbro'::text as kind
    from stamp_events where kind = 'stamp' and undone_at is null
  union all
  select shop_id, created_at, 'punti'
    from points_events where kind = 'add' and undone_at is null
  union all
  select shop_id, created_at, 'tessera'
    from prepaid_events where kind = 'consume' and undone_at is null;

revoke all on support_activity from public, anon, authenticated;

-- Cose da guardare per negozio, una riga per tipo, in ordine di gravità (priority più bassa = prima).
--   sync        carte con aggiornamenti verso Google ancora aperti (in ritentativo o esauriti)
--   ticket      pacchetto "Invia diagnostica" arrivato nelle ultime 24 ore
--   invito      il titolare non ha mai fatto l'accesso: il negozio non è operativo
--   inattivo    negozio attivo da più di 14 giorni senza iscrizioni né attività negli ultimi 14
--   diagnostica modalità diagnostica aperta sul negozio
--   sospeso     negozio sospeso (con data e motivo dall'audit)
create or replace function support_shop_issues()
returns table(shop_id uuid, kind text, priority int, since timestamptz, detail jsonb)
language sql
stable
security definer
set search_path = public
as $$
  with fail as (
    select f.shop_id,
           count(distinct coalesce(f.customer_id, f.prepaid_card_id))
             filter (where f.kind in ('object', 'prepaid_object')) as cards,
           count(*) filter (where f.kind in ('class', 'prepaid_class')) as templates,
           count(*) filter (where f.exhausted_at is not null) as exhausted,
           min(f.created_at) as since,
           (array_agg(f.error_code order by f.updated_at desc nulls last))[1] as error_code,
           max(f.updated_at) as last_at
      from wallet_sync_failures f
     where f.resolved_at is null and f.kind <> 'message' and f.shop_id is not null
     group by f.shop_id
  ),
  tickets as (
    select distinct on (b.shop_id) b.shop_id, b.ticket_code, b.created_at, b.platform, b.app_version,
           case when jsonb_typeof(b.events) = 'array' then jsonb_array_length(b.events) else 0 end as lines,
           count(*) over (partition by b.shop_id) as total
      from diagnostic_bundles b
     where b.shop_id is not null and b.created_at > now() - interval '24 hours'
     order by b.shop_id, b.created_at desc
  ),
  owners as (
    select s.shop_id, s.display_name, u.invited_at, u.created_at
      from staff s
      join auth.users u on u.id = s.user_id
     where s.role = 'owner' and u.last_sign_in_at is null
       and not exists (
         select 1 from staff s2 join auth.users u2 on u2.id = s2.user_id
          where s2.shop_id = s.shop_id and s2.role = 'owner' and u2.last_sign_in_at is not null)
  ),
  last_act as (
    select sh.id as shop_id,
           greatest(
             (select max(a.at) from support_activity a where a.shop_id = sh.id),
             (select max(c.created_at) from customers c where c.shop_id = sh.id)
           ) as at
      from shops sh
     where sh.status = 'active' and sh.created_at < now() - interval '14 days'
  ),
  modes as (
    select distinct on (m.scope_id) m.scope_id as shop_id, m.level, m.enabled_by, m.enabled_at, m.expires_at
      from diagnostic_modes m
     where m.scope_type = 'shop' and m.disabled_at is null and m.expires_at > now()
     order by m.scope_id, m.expires_at desc
  ),
  suspended as (
    select sh.id as shop_id,
           (select a.ts from audit_log a where a.shop_id = sh.id and a.action = 'shop_suspend' order by a.ts desc limit 1) as ts,
           (select a.reason from audit_log a where a.shop_id = sh.id and a.action = 'shop_suspend' order by a.ts desc limit 1) as reason
      from shops sh
     where sh.status = 'suspended'
  )
  select f.shop_id, 'sync', 1, f.since,
         jsonb_build_object('cards', f.cards, 'templates', f.templates, 'exhausted', f.exhausted,
                            'error_code', f.error_code, 'last_at', f.last_at)
    from fail f join shops sh on sh.id = f.shop_id
   where sh.status = 'active'
  union all
  select t.shop_id, 'ticket', 2, t.created_at,
         jsonb_build_object('ticket', t.ticket_code, 'platform', t.platform, 'app_version', t.app_version,
                            'lines', t.lines, 'total', t.total)
    from tickets t
  union all
  select o.shop_id, 'invito', 3, coalesce(o.invited_at, o.created_at),
         jsonb_build_object('owner', o.display_name)
    from owners o join shops sh on sh.id = o.shop_id
   where sh.status = 'active'
  union all
  select l.shop_id, 'inattivo', 4, l.at, jsonb_build_object('last_at', l.at)
    from last_act l
   where l.at is null or l.at < now() - interval '14 days'
  union all
  select m.shop_id, 'diagnostica', 5, m.enabled_at,
         jsonb_build_object('level', m.level, 'enabled_by', m.enabled_by, 'expires_at', m.expires_at)
    from modes m
  union all
  select s.shop_id, 'sospeso', 6, s.ts, jsonb_build_object('reason', s.reason)
    from suspended s;
$$;

-- Panoramica di rete per gli ultimi p_days giorni (1, 7 o 30), con il confronto sul periodo precedente.
create or replace function support_network_overview(p_days int)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with
  p as (select greatest(1, least(coalesce(p_days, 7), 90)) as days),
  bounds as (
    select now() - make_interval(days => (select days from p)) as since,
           now() - make_interval(days => 2 * (select days from p)) as prev_since
  ),
  issues as (select * from support_shop_issues()),
  day0 as (select (now() at time zone 'Europe/Rome')::date as today),
  days30 as (select (select today from day0) - g as day from generate_series(29, 0, -1) as g),
  act30 as materialized (
    select (a.at at time zone 'Europe/Rome')::date as day, count(*) as n
      from support_activity a
     where a.at >= ((select today from day0) - 29)::timestamp at time zone 'Europe/Rome'
     group by 1
  ),
  enr30 as materialized (
    select (c.created_at at time zone 'Europe/Rome')::date as day, count(*) as n
      from customers c
     where c.created_at >= ((select today from day0) - 29)::timestamp at time zone 'Europe/Rome'
     group by 1
  ),
  err30 as materialized (
    select (l.ts at time zone 'Europe/Rome')::date as day, count(*) as n
      from log_events l
     where l.level = 'error' and l.ts >= ((select today from day0) - 29)::timestamp at time zone 'Europe/Rome'
     group by 1
  ),
  errors24 as (
    select coalesce(l.error_code, 'senza codice') as code, count(*) as n
      from log_events l
     where l.level = 'error' and l.ts > now() - interval '24 hours'
     group by 1
  ),
  top as (
    select a.shop_id, count(*) as n
      from support_activity a
     where a.at >= (select since from bounds)
     group by 1
     order by 2 desc
     limit 5
  ),
  google24 as (
    select count(*) filter (where l.event like 'wallet.google.%') as calls,
           count(*) filter (where l.event like 'wallet.google.%' and l.event like '%.failed') as failed
      from log_events l
     where l.ts > now() - interval '24 hours'
  ),
  sms24 as (
    select count(*) filter (where l.event = 'enroll.otp.sent') as sent,
           count(*) filter (where l.event = 'enroll.otp.send_failed') as failed
      from log_events l
     where l.ts > now() - interval '24 hours'
  ),
  changes as (
    select a.ts, a.actor_type, a.actor_id, a.action, a.reason, a.after, a.shop_id, sh.name as shop_name
      from audit_log a
      left join shops sh on sh.id = a.shop_id
     where a.action in ('shop_create', 'shop_suspend', 'shop_reactivate', 'shop_legal_update', 'settings_update',
                        'staff_invite', 'staff_revoke', 'staff_role_change', 'customer_delete', 'customer_export',
                        'diagnostic_enable', 'diagnostic_disable', 'promo_send', 'prepaid_product_create',
                        'prepaid_product_update', 'points_settings_update', 'support_member_add', 'wallet_resync')
     order by a.ts desc
     limit 8
  )
  select jsonb_build_object(
    'days', (select days from p),
    'shops_active', (select count(*) from shops where status = 'active'),
    'shops_suspended', (select count(*) from shops where status = 'suspended'),
    'shops_new_30', (select count(*) from shops where created_at > now() - interval '30 days'),
    'customers', (select count(*) from customers where deleted_at is null),
    'customers_new', (select count(*) from customers where created_at >= (select since from bounds)),
    'activity', (select count(*) from support_activity where at >= (select since from bounds)),
    'activity_prev', (select count(*) from support_activity
                       where at >= (select prev_since from bounds) and at < (select since from bounds)),
    'enroll_started', (select count(*) from enrollment_sessions where created_at >= (select since from bounds)),
    'enroll_verified', (select count(*) from enrollment_sessions
                         where created_at >= (select since from bounds) and status = 'verified'),
    'errors_24h', (select coalesce(sum(n), 0) from errors24),
    'errors_top', coalesce((select jsonb_agg(jsonb_build_object('code', code, 'count', n) order by n desc)
                              from (select * from errors24 order by n desc limit 3) e), '[]'::jsonb),
    'unsynced_cards', (select coalesce(sum((detail->>'cards')::int), 0) from issues where kind = 'sync'),
    'unsynced_shops', coalesce((select jsonb_agg(sh.name order by sh.name)
                                  from issues i join shops sh on sh.id = i.shop_id where i.kind = 'sync'), '[]'::jsonb),
    'problem_shops', (select count(distinct shop_id) from issues where kind in ('sync', 'ticket')),
    'open_tickets', (select count(*) from diagnostic_bundles where created_at > now() - interval '24 hours'),
    -- una riga per negozio: la cosa più grave
    'watch', coalesce((
      select jsonb_agg(jsonb_build_object(
               'shop_id', w.shop_id, 'shop_name', w.name, 'kind', w.kind, 'since', w.since, 'detail', w.detail)
             order by w.priority, w.since)
        from (
          select distinct on (i.shop_id) i.*, sh.name
            from issues i join shops sh on sh.id = i.shop_id
           where i.kind <> 'sospeso'
           order by i.shop_id, i.priority
        ) w
    ), '[]'::jsonb),
    'services', jsonb_build_object(
      'google_calls', (select calls from google24),
      'google_failed', (select failed from google24),
      'sms_sent', (select sent from sms24),
      'sms_failed', (select failed from sms24),
      'blocked_numbers', (select count(*) from otp_blocks where blocked_until > now()),
      'queue_pending', (select count(*) from wallet_sync_failures where resolved_at is null and exhausted_at is null),
      'queue_exhausted', (select count(*) from wallet_sync_failures where resolved_at is null and exhausted_at is not null),
      'cron_last_at', (select max(ts) from log_events where event = 'cron.wallet_sync.run')
    ),
    'series', (
      select jsonb_agg(jsonb_build_object(
               'day', to_char(d.day, 'YYYY-MM-DD'),
               'activity', coalesce((select n from act30 where act30.day = d.day), 0),
               'enrollments', coalesce((select n from enr30 where enr30.day = d.day), 0),
               'errors', coalesce((select n from err30 where err30.day = d.day), 0))
             order by d.day)
        from days30 d
    ),
    'top_shops', coalesce((
      select jsonb_agg(jsonb_build_object('shop_id', t.shop_id, 'name', sh.name, 'count', t.n) order by t.n desc)
        from top t join shops sh on sh.id = t.shop_id
    ), '[]'::jsonb),
    'changes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'ts', c.ts, 'actor_type', c.actor_type, 'actor_id', c.actor_id, 'action', c.action,
               'reason', c.reason, 'shop_id', c.shop_id, 'shop_name', c.shop_name,
               'actor_name', case when c.actor_type = 'staff' then (
                 select st.display_name from staff st
                  where st.user_id::text = c.actor_id and st.shop_id = c.shop_id) end)
             order by c.ts desc)
        from changes c
    ), '[]'::jsonb)
  );
$$;

-- Elenco dei negozi per le card: programma, numeri degli ultimi 7 giorni, attività di 30 giorni e cose da guardare.
create or replace function support_shops_overview()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with
  issues as (select * from support_shop_issues()),
  day0 as (select (now() at time zone 'Europe/Rome')::date as today),
  since30 as (select ((select today from day0) - 29)::timestamp at time zone 'Europe/Rome' as at),
  act as materialized (
    select a.shop_id, (a.at at time zone 'Europe/Rome')::date as day, count(*) as n
      from support_activity a
     where a.at >= (select at from since30)
     group by 1, 2
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', sh.id, 'slug', sh.slug, 'name', sh.name, 'status', sh.status, 'created_at', sh.created_at,
    'hex_color', sh.hex_color, 'loyalty_enabled', sh.loyalty_enabled, 'loyalty_mode', sh.loyalty_mode,
    'stamps_required', sh.stamps_required, 'reward_label', sh.reward_label,
    'points_per_euro', sh.points_per_euro,
    'levels', case when jsonb_typeof(sh.points_levels) = 'array' then jsonb_array_length(sh.points_levels) else 0 end,
    'prepaid_kinds', coalesce((select jsonb_agg(distinct pp.kind) from prepaid_products pp
                                where pp.shop_id = sh.id and pp.active), '[]'::jsonb),
    'customers', (select count(*) from customers c where c.shop_id = sh.id and c.deleted_at is null),
    'customers_new_7', (select count(*) from customers c
                         where c.shop_id = sh.id and c.created_at > now() - interval '7 days'),
    'activity_7', (select count(*) from support_activity a
                    where a.shop_id = sh.id and a.at > now() - interval '7 days'),
    'staff', (select count(*) from staff s where s.shop_id = sh.id),
    'owner', (select s.display_name from staff s where s.shop_id = sh.id and s.role = 'owner'
               order by s.display_name limit 1),
    'owner_email', (select u.email::text from staff s join auth.users u on u.id = s.user_id
                     where s.shop_id = sh.id and s.role = 'owner' order by s.display_name limit 1),
    'vat_number', sh.vat_number,
    'spark', (select jsonb_agg(coalesce(act.n, 0) order by g.day)
                from (select (select today from day0) - x as day from generate_series(29, 0, -1) as x) g
                left join act on act.shop_id = sh.id and act.day = g.day),
    'issues', coalesce((select jsonb_agg(jsonb_build_object('kind', i.kind, 'since', i.since, 'detail', i.detail)
                                         order by i.priority)
                          from issues i where i.shop_id = sh.id), '[]'::jsonb)
  ) order by sh.name), '[]'::jsonb)
  from shops sh;
$$;

-- Scheda negozio: indicatori, attività giorno per giorno, stato di salute e ultimi clienti attivi.
create or replace function support_shop_overview(p_shop_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with
  sh as (select * from shops where id = p_shop_id),
  day0 as (select (now() at time zone 'Europe/Rome')::date as today),
  act as materialized (
    select (a.at at time zone 'Europe/Rome')::date as day, count(*) as n
      from support_activity a
     where a.shop_id = p_shop_id
       and a.at >= ((select today from day0) - 29)::timestamp at time zone 'Europe/Rome'
     group by 1
  ),
  visits60 as (
    select a.customer_id, count(*) as n
      from (
        select customer_id from stamp_events
         where shop_id = p_shop_id and kind = 'stamp' and undone_at is null and created_at > now() - interval '60 days'
        union all
        select customer_id from points_events
         where shop_id = p_shop_id and kind = 'add' and undone_at is null and created_at > now() - interval '60 days'
      ) a
     group by 1
  ),
  open_fail as materialized (
    select f.customer_id, max(f.error_code) as error_code
      from wallet_sync_failures f
     where f.shop_id = p_shop_id and f.resolved_at is null and f.kind = 'object'
     group by 1
  ),
  recent as (
    select o.id, o.short_code, o.name, o.stamps, o.rewards_available, o.points, o.last_visit_at
      from customer_overview o
     where o.shop_id = p_shop_id and o.last_visit_at is not null
     order by o.last_visit_at desc
     limit 5
  )
  select jsonb_build_object(
    'customers', (select count(*) from customers where shop_id = p_shop_id and deleted_at is null),
    'customers_new_7', (select count(*) from customers
                         where shop_id = p_shop_id and created_at > now() - interval '7 days'),
    'activity_7', (select count(*) from support_activity
                    where shop_id = p_shop_id and at > now() - interval '7 days'),
    'activity_prev_7', (select count(*) from support_activity
                         where shop_id = p_shop_id and at > now() - interval '14 days'
                           and at <= now() - interval '7 days'),
    'redeems_30', (select count(*) from stamp_events
                    where shop_id = p_shop_id and kind = 'redeem' and undone_at is null
                      and created_at > now() - interval '30 days'),
    'visitors_60', (select count(*) from visits60),
    'returning_60', (select count(*) from visits60 where n >= 2),
    'series', (
      select jsonb_agg(jsonb_build_object('day', to_char(g.day, 'YYYY-MM-DD'), 'count', coalesce(act.n, 0))
             order by g.day)
        from (select (select today from day0) - x as day from generate_series(29, 0, -1) as x) g
        left join act on act.day = g.day
    ),
    'google', jsonb_build_object(
      'cards', (select count(*) from customers where shop_id = p_shop_id and deleted_at is null),
      'synced', (select count(*) from wallet_sync_state s join customers c on c.id = s.customer_id and c.deleted_at is null
                  where s.shop_id = p_shop_id and s.wallet = 'google' and s.last_success_at is not null),
      'failing', (select count(*) from open_fail),
      'last_error_at', (select max(f.updated_at) from wallet_sync_failures f
                         where f.shop_id = p_shop_id and f.resolved_at is null and f.kind <> 'message'),
      'last_error_code', (select f.error_code from wallet_sync_failures f
                           where f.shop_id = p_shop_id and f.resolved_at is null and f.kind <> 'message'
                           order by f.updated_at desc nulls last limit 1),
      'class_failing', (select count(*) from wallet_sync_failures f
                         where f.shop_id = p_shop_id and f.resolved_at is null and f.kind in ('class', 'prepaid_class')),
      'card_version', (select card_version from sh)
    ),
    'enroll', jsonb_build_object(
      'started_7', (select count(*) from enrollment_sessions
                     where shop_id = p_shop_id and created_at > now() - interval '7 days'),
      'verified_7', (select count(*) from enrollment_sessions
                      where shop_id = p_shop_id and created_at > now() - interval '7 days' and status = 'verified'),
      'blocked', (select count(distinct b.phone_hash) from otp_blocks b
                   where b.blocked_until > now()
                     and exists (select 1 from enrollment_sessions e
                                  where e.shop_id = p_shop_id and e.phone_hash = b.phone_hash))
    ),
    'recent', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', r.id, 'short_code', r.short_code, 'name', r.name, 'stamps', r.stamps,
               'rewards', r.rewards_available, 'points', r.points, 'last_visit_at', r.last_visit_at,
               'wallet_error', f.error_code,
               'wallet_synced', exists (select 1 from wallet_sync_state s
                                         where s.customer_id = r.id and s.wallet = 'google'
                                           and s.last_success_at is not null))
             order by r.last_visit_at desc)
        from recent r left join open_fail f on f.customer_id = r.id
    ), '[]'::jsonb),
    'issues', coalesce((
      select jsonb_agg(jsonb_build_object('kind', i.kind, 'since', i.since, 'detail', i.detail) order by i.priority)
        from support_shop_issues() i where i.shop_id = p_shop_id
    ), '[]'::jsonb)
  );
$$;

revoke all on function support_shop_issues() from public, anon, authenticated;
revoke all on function support_network_overview(int) from public, anon, authenticated;
revoke all on function support_shops_overview() from public, anon, authenticated;
revoke all on function support_shop_overview(uuid) from public, anon, authenticated;
