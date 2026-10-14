-- =============================================================
-- Gestione dello staff e impostazioni del negozio: funzioni
-- atomiche, solo titolare, con audit nella stessa transazione.
-- Il negozio non resta mai senza titolare (E_LAST_OWNER).
-- =============================================================

alter table shops add column logo_path text;

-- Utente Supabase Auth per email (per l'invito di chi ha già un account).
create or replace function find_user_id_by_email(p_email text)
returns uuid
language sql
stable
security definer
set search_path = public, auth
as $$
  select id from auth.users where lower(email) = lower(trim(p_email)) limit 1;
$$;

create or replace function _owners_count(p_shop_id uuid)
returns int
language sql
stable
as $$
  select count(*)::int from staff where shop_id = p_shop_id and role = 'owner';
$$;

create or replace function add_staff_member(
  p_shop_id uuid, p_user_id uuid, p_role text, p_display_name text, p_meta jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor staff;
begin
  v_actor := _require_staff(p_meta, p_shop_id, true);
  if exists (select 1 from staff where shop_id = p_shop_id and user_id = p_user_id) then
    perform _raise('E_STAFF_ALREADY_MEMBER', jsonb_build_object('user_id', p_user_id));
  end if;
  insert into staff (user_id, shop_id, role, display_name) values (p_user_id, p_shop_id, p_role, trim(p_display_name));
  perform _audit(p_meta, p_shop_id, 'staff_invite', 'staff', p_user_id::text, null,
                 jsonb_build_object('role', p_role, 'display_name', trim(p_display_name)));
  return jsonb_build_object('user_id', p_user_id, 'role', p_role, 'display_name', trim(p_display_name))
      || _staff_json(v_actor);
end;
$$;

-- Cambia ruolo e/o nome di un membro dello staff (null = invariato).
create or replace function update_staff_member(
  p_shop_id uuid, p_user_id uuid, p_role text, p_display_name text, p_meta jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor staff;
  v_old staff;
  v_new staff;
begin
  v_actor := _require_staff(p_meta, p_shop_id, true);
  select * into v_old from staff where shop_id = p_shop_id and user_id = p_user_id for update;
  if not found then
    perform _raise('E_STAFF_NOT_FOUND', jsonb_build_object('user_id', p_user_id));
  end if;
  -- lock su tutto lo staff del negozio: due declassamenti concorrenti non lasciano zero titolari
  perform 1 from staff where shop_id = p_shop_id for update;
  if v_old.role = 'owner' and coalesce(p_role, v_old.role) <> 'owner' and _owners_count(p_shop_id) <= 1 then
    perform _raise('E_LAST_OWNER', jsonb_build_object('user_id', p_user_id, 'display_name', v_old.display_name));
  end if;

  update staff
     set role = coalesce(p_role, role), display_name = coalesce(nullif(trim(p_display_name), ''), display_name)
   where shop_id = p_shop_id and user_id = p_user_id
  returning * into v_new;

  perform _audit(p_meta, p_shop_id, 'staff_role_change', 'staff', p_user_id::text,
                 jsonb_build_object('role', v_old.role, 'display_name', v_old.display_name),
                 jsonb_build_object('role', v_new.role, 'display_name', v_new.display_name));
  return jsonb_build_object('user_id', p_user_id, 'role_before', v_old.role, 'role', v_new.role,
                            'display_name', v_new.display_name)
      || _staff_json(v_actor);
end;
$$;

create or replace function remove_staff_member(p_shop_id uuid, p_user_id uuid, p_meta jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor staff;
  v_old staff;
begin
  v_actor := _require_staff(p_meta, p_shop_id, true);
  select * into v_old from staff where shop_id = p_shop_id and user_id = p_user_id;
  if not found then
    perform _raise('E_STAFF_NOT_FOUND', jsonb_build_object('user_id', p_user_id));
  end if;
  perform 1 from staff where shop_id = p_shop_id for update;
  if v_old.role = 'owner' and _owners_count(p_shop_id) <= 1 then
    perform _raise('E_LAST_OWNER', jsonb_build_object('user_id', p_user_id, 'display_name', v_old.display_name));
  end if;

  delete from staff where shop_id = p_shop_id and user_id = p_user_id;
  perform _audit(p_meta, p_shop_id, 'staff_revoke', 'staff', p_user_id::text,
                 jsonb_build_object('role', v_old.role, 'display_name', v_old.display_name), null);
  return jsonb_build_object('user_id', p_user_id, 'role', v_old.role, 'display_name', v_old.display_name)
      || _staff_json(v_actor);
end;
$$;

-- Aggiorna solo le chiavi presenti in p_changes; audit con i soli campi cambiati.
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
                                   'legal_name', 'vat_number', 'privacy_email'];
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
    privacy_email          = case when p_changes ? 'privacy_email' then p_changes->>'privacy_email' else privacy_email end
  where id = p_shop_id;

  select to_jsonb(s) into v_new from shops s where id = p_shop_id;
  foreach k in array allowed loop
    if v_old->k is distinct from v_new->k then
      v_before := v_before || jsonb_build_object(k, v_old->k);
      v_after := v_after || jsonb_build_object(k, v_new->k);
    end if;
  end loop;

  if v_after <> '{}' then
    perform _audit(p_meta, p_shop_id, 'settings_update', 'shop', p_shop_id::text, v_before, v_after);
  end if;
  return jsonb_build_object('before', v_before, 'after', v_after, 'shop_name', v_new->>'name') || _staff_json(v_actor);
end;
$$;

revoke all on function find_user_id_by_email(text) from public, anon, authenticated;
revoke all on function _owners_count(uuid) from public, anon, authenticated;
revoke all on function add_staff_member(uuid, uuid, text, text, jsonb) from public, anon, authenticated;
revoke all on function update_staff_member(uuid, uuid, text, text, jsonb) from public, anon, authenticated;
revoke all on function remove_staff_member(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function update_shop_settings(uuid, jsonb, jsonb) from public, anon, authenticated;
