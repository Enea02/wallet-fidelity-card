/** Colonne lette per negozio e cliente (dominio e sincronizzazione con i wallet). */
export const SHOP_COLS =
  "id, slug, name, stamps_required, reward_label, logo_url, hex_color, stamp_cooldown_minutes, status, program_name, stamp_unit, stamp_unit_plural, card_version, legal_name, vat_number, privacy_email, tagline, stamp_icon, loyalty_enabled";
export const CUSTOMER_COLS = "id, shop_id, name, phone, qr_token, short_code, stamps, rewards_available, deleted_at";
export const PREPAID_PRODUCT_COLS =
  "id, shop_id, code, name, units, unit_singular, unit_plural, validity_months, active, card_version";
export const PREPAID_CARD_COLS =
  "id, shop_id, product_id, customer_id, qr_token, short_code, status, balance, charged_units, activated_at, expires_at, created_at, deleted_at";
