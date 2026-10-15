-- =============================================================
-- Fase 8: area titolare.
-- - shop_stats ampliata per la dashboard del design (premi sbloccati, inattivi recenti,
--   inattivi con consenso marketing);
-- - customer_overview: ultima visita di ogni cliente (lista con filtri "Con premio" e "Inattivi");
-- - staff_overview: timbri dati da ogni membro e invito ancora da accettare;
-- - impostazioni: anche icona del timbro e frase d'apertura (timbri necessari 5-20: lo valida l'API);
-- - consenso marketing: lo staff può solo revocarlo (lo dà il cliente, iscrivendosi).
-- =============================================================

-- ---------- clienti con ultima visita ----------

-- Ultima visita = ultimo timbro o riscatto non annullato; senza visite conta l'iscrizione.
create or replace view customer_overview
with (security_invoker = true) as
select
  c.id, c.shop_id, c.short_code, c.name, c.phone, c.stamps, c.rewards_available,
  c.consent_marketing, c.created_at,
  v.last_visit_at,
  coalesce(v.last_visit_at, c.created_at) as last_activity_at
from customers c
left join lateral (
  select max(e.created_at) as last_visit_at
  from stamp_events e
  where e.customer_id = c.id and e.undone_at is null and e.kind in ('stamp', 'redeem')
) v on true
where c.deleted_at is null;

revoke all on customer_overview from public, anon, authenticated;
grant select on customer_overview to service_role;

-- ---------- statistiche ----------

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
    select date_trunc('week', created_at at time zone 'Europe/Rome') as week_start, kind, reward_unlocked
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
  inactive as (
    select o.*
    from customer_overview o
    where o.shop_id = p_shop_id and o.last_activity_at < now() - interval '60 days'
  )
  select jsonb_build_object(
    'customers_total', (select count(*) from customers where shop_id = p_shop_id and deleted_at is null),
    'customers_marketing', (select count(*) from customers where shop_id = p_shop_id and deleted_at is null and consent_marketing),
    'inactive_60_days', (select count(*) from inactive),
    'inactive_marketing', (select count(*) from inactive where consent_marketing),
    -- i più recenti tra gli inattivi: quelli che vale la pena richiamare per primi
    'inactive_recent', coalesce((
      select jsonb_agg(jsonb_build_object(
        'customer_id', i.id, 'name', i.name, 'stamps', i.stamps,
        'last_activity_at', i.last_activity_at
      ) order by i.last_activity_at desc)
      from (select * from inactive order by last_activity_at desc limit 5) i
    ), '[]'::jsonb),
    'weeks', (
      select jsonb_agg(jsonb_build_object(
        'week_start', to_char(w.week_start, 'YYYY-MM-DD'),
        'stamps', (select count(*) from ev where ev.week_start = w.week_start and kind = 'stamp'),
        'unlocked', (select count(*) from ev where ev.week_start = w.week_start and kind = 'stamp' and reward_unlocked),
        'redeems', (select count(*) from ev where ev.week_start = w.week_start and kind = 'redeem'),
        'enrollments', (select count(*) from enr where enr.week_start = w.week_start)
      ) order by w.week_start)
      from weeks w
    )
  );
$$;

-- ---------- staff con attività e inviti ----------

create or replace function staff_overview(p_shop_id uuid)
returns table (
  user_id uuid, display_name text, role text, email text,
  stamps_given bigint, invite_pending boolean, invited_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select s.user_id, s.display_name, s.role, u.email::text,
         (select count(*) from stamp_events e
           where e.shop_id = s.shop_id and e.staff_user_id = s.user_id
             and e.kind = 'stamp' and e.undone_at is null),
         -- invito mai accettato: nessun accesso e nessuna password impostata
         (u.last_sign_in_at is null),
         u.invited_at
  from staff s
  join auth.users u on u.id = s.user_id
  where s.shop_id = p_shop_id
  order by (s.role = 'owner') desc, s.display_name;
$$;

-- ---------- impostazioni: icona del timbro e frase d'apertura ----------

create or replace function update_shop_settings(p_shop_id uuid, p_changes jsonb, p_meta jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor staff;
  v_old jsonb;
  v_new jsonb;
  v_before jsonb := '{}';
  v_after jsonb := '{}';
  k text;
  allowed constant text[] := array['name', 'hex_color', 'stamps_required', 'reward_label',
                                   'stamp_cooldown_minutes', 'logo_path', 'logo_url',
                                   'legal_name', 'vat_number', 'privacy_email',
                                   'program_name', 'stamp_unit', 'stamp_unit_plural',
                                   'stamp_icon', 'tagline'];
  -- campi visibili sulla carta nel Wallet: se cambiano, tutte le carte vanno riallineate
  card_fields constant text[] := array['name', 'hex_color', 'stamps_required', 'reward_label',
                                       'stamp_cooldown_minutes', 'logo_url', 'legal_name', 'privacy_email',
                                       'program_name', 'stamp_unit', 'stamp_unit_plural', 'stamp_icon'];
  v_card_changed boolean := false;
begin
  v_actor := _require_staff(p_meta, p_shop_id, true);
  for k in select jsonb_object_keys(p_changes) loop
    if not k = any(allowed) then
      perform _raise('E_VALIDATION', jsonb_build_object('field', k, 'problem', 'campo non modificabile'));
    end if;
  end loop;

  select to_jsonb(s) into v_old from shops s where id = p_shop_id for update;

  update shops set
    name                   = case when p_changes ? 'name' then p_changes->>'name' else name end,
    hex_color              = case when p_changes ? 'hex_color' then p_changes->>'hex_color' else hex_color end,
    stamps_required        = case when p_changes ? 'stamps_required' then (p_changes->>'stamps_required')::int else stamps_required end,
    reward_label           = case when p_changes ? 'reward_label' then p_changes->>'reward_label' else reward_label end,
    stamp_cooldown_minutes = case when p_changes ? 'stamp_cooldown_minutes' then (p_changes->>'stamp_cooldown_minutes')::int else stamp_cooldown_minutes end,
    logo_path              = case when p_changes ? 'logo_path' then p_changes->>'logo_path' else logo_path end,
    logo_url               = case when p_changes ? 'logo_url' then p_changes->>'logo_url' else logo_url end,
    legal_name             = case when p_changes ? 'legal_name' then p_changes->>'legal_name' else legal_name end,
    vat_number             = case when p_changes ? 'vat_number' then p_changes->>'vat_number' else vat_number end,
    privacy_email          = case when p_changes ? 'privacy_email' then p_changes->>'privacy_email' else privacy_email end,
    program_name           = case when p_changes ? 'program_name' then p_changes->>'program_name' else program_name end,
    stamp_unit             = case when p_changes ? 'stamp_unit' then p_changes->>'stamp_unit' else stamp_unit end,
    stamp_unit_plural      = case when p_changes ? 'stamp_unit_plural' then p_changes->>'stamp_unit_plural' else stamp_unit_plural end,
    stamp_icon             = case when p_changes ? 'stamp_icon' then p_changes->>'stamp_icon' else stamp_icon end,
    tagline                = case when p_changes ? 'tagline' then nullif(p_changes->>'tagline', '') else tagline end
  where id = p_shop_id;

  select to_jsonb(s) into v_new from shops s where id = p_shop_id;
  foreach k in array allowed loop
    if v_old->k is distinct from v_new->k then
      v_before := v_before || jsonb_build_object(k, v_old->k);
      v_after := v_after || jsonb_build_object(k, v_new->k);
      if k = any(card_fields) then
        v_card_changed := true;
      end if;
    end if;
  end loop;

  if v_card_changed then
    update shops set card_version = card_version + 1 where id = p_shop_id;
  end if;

  if v_after <> '{}' then
    perform _audit(p_meta, p_shop_id, 'settings_update', 'shop', p_shop_id::text, v_before, v_after);
  end if;
  return jsonb_build_object('before', v_before, 'after', v_after, 'shop_name', v_new->>'name',
                            'card_changed', v_card_changed)
      || _staff_json(v_actor);
end;
$$;

-- ---------- consenso marketing: lo staff può solo revocarlo ----------

create or replace function set_marketing_consent(p_customer_id uuid, p_consent boolean, p_meta jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_c customers;
  v_s shops;
  v_extra jsonb;
begin
  select * into v_c from customers where id = p_customer_id for update;
  if not found then
    perform _raise('E_CARD_NOT_FOUND', jsonb_build_object('customer_id', p_customer_id));
  end if;
  select * into v_s from shops where id = v_c.shop_id;
  if coalesce(p_meta->>'actor_type', '') = 'customer' then
    if p_meta->>'actor_id' is distinct from v_c.id::text then
      perform _raise('E_FORBIDDEN_ROLE', jsonb_build_object('reason', 'un cliente può cambiare solo il proprio consenso'));
    end if;
    v_extra := jsonb_build_object('staff_name', 'il cliente', 'staff_role', 'customer');
  else
    v_extra := _staff_json(_require_staff(p_meta, v_s.id, true));
    -- il consenso alle promozioni lo dà solo il cliente (pagina di iscrizione): lo staff può solo revocarlo
    if p_consent and not v_c.consent_marketing then
      perform _raise('E_CONSENT_BY_CUSTOMER_ONLY', jsonb_build_object('short_code', v_c.short_code));
    end if;
  end if;
  perform _ensure_not_deleted(v_c);

  if v_c.consent_marketing = p_consent then
    return _card_json(v_c, v_s) || jsonb_build_object('changed', false, 'consent_marketing', p_consent) || v_extra;
  end if;

  update customers set consent_marketing = p_consent where id = v_c.id;
  perform _audit(p_meta, v_s.id, 'marketing_consent', 'customer', v_c.id::text,
                 jsonb_build_object('consent_marketing', v_c.consent_marketing),
                 jsonb_build_object('consent_marketing', p_consent));

  return _card_json(v_c, v_s) || jsonb_build_object('changed', true, 'consent_marketing', p_consent) || v_extra;
end;
$$;

revoke all on function shop_stats(uuid) from public, anon, authenticated;
revoke all on function staff_overview(uuid) from public, anon, authenticated;
revoke all on function update_shop_settings(uuid, jsonb, jsonb) from public, anon, authenticated;
revoke all on function set_marketing_consent(uuid, boolean, jsonb) from public, anon, authenticated;
