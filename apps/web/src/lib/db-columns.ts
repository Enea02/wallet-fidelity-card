/** Colonne lette per negozio e cliente (dominio e sincronizzazione con i wallet). */
export const SHOP_COLS =
  "id, slug, name, stamps_required, reward_label, logo_url, hex_color, stamp_cooldown_minutes, status, program_name, stamp_unit, stamp_unit_plural, card_version, legal_name, privacy_email";
export const CUSTOMER_COLS = "id, shop_id, name, phone, qr_token, short_code, stamps, rewards_available, deleted_at";
