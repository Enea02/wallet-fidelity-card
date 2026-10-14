-- =============================================================
-- Testi della carta nel Wallet (docs/design/Carte Wallet.dc.html):
-- nome del programma e unità al singolare/plurale ("Ti mancano 4 tagli").
-- card_version sale quando cambia qualcosa di visibile sulla carta:
-- la riconciliazione riallinea le carte con una versione vecchia.
-- =============================================================

alter table shops
  add column program_name      text not null default 'Carta fedeltà' check (length(trim(program_name)) between 2 and 40),
  add column stamp_unit        text not null default 'visita'        check (length(trim(stamp_unit)) between 2 and 20),
  add column stamp_unit_plural text not null default 'visite'        check (length(trim(stamp_unit_plural)) between 2 and 20),
  add column card_version      int  not null default 1;

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
                                   'legal_name', 'vat_number', 'privacy_email',
                                   'program_name', 'stamp_unit', 'stamp_unit_plural'];
  -- campi visibili sulla carta nel Wallet: se cambiano, tutte le carte vanno riallineate
  card_fields constant text[] := array['name', 'hex_color', 'stamps_required', 'reward_label',
                                       'stamp_cooldown_minutes', 'logo_url', 'legal_name', 'privacy_email',
                                       'program_name', 'stamp_unit', 'stamp_unit_plural'];
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
    stamp_unit_plural      = case when p_changes ? 'stamp_unit_plural' then p_changes->>'stamp_unit_plural' else stamp_unit_plural end
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

