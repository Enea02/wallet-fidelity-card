export interface Shop {
  id: string;
  slug: string;
  name: string;
  stamps_required: number;
  reward_label: string;
  logo_url: string | null;
  hex_color: string;
  stamp_cooldown_minutes: number;
  status: "active" | "suspended";
  /** Testi della carta: "Carta Amica", "taglio" / "tagli". */
  program_name: string;
  stamp_unit: string;
  stamp_unit_plural: string;
  /** Sale quando cambia qualcosa di visibile sulla carta: le carte con versione vecchia vanno riallineate. */
  card_version: number;
  legal_name: string | null;
  vat_number: string | null;
  privacy_email: string | null;
  /** Frase d'apertura della pagina di iscrizione (null = generata). */
  tagline: string | null;
  /** Icona dei timbri: scissors | cup | pizza | sparkle | gift | check. */
  stamp_icon: string;
  /** false: il negozio offre solo tessere prepagate (Fase 9.5). */
  loyalty_enabled: boolean;
}

export interface Customer {
  id: string;
  shop_id: string;
  /** "Cliente cancellato" dopo la cancellazione. */
  name: string;
  /** null dopo la cancellazione. */
  phone: string | null;
  qr_token: string;
  /** Codice breve leggibile (8 caratteri), stampato sotto il QR e usato nei log come customer_ref. */
  short_code: string;
  stamps: number;
  rewards_available: number;
  deleted_at: string | null;
}

/** Stato della carta che i wallet devono mostrare. */
export interface CardState {
  shop: Shop;
  customer: Customer;
}

export type StaffRole = "owner" | "operator";

/** Tipo di tessera prepagata del negozio (Fase 9.5). */
export interface PrepaidProduct {
  id: string;
  shop_id: string;
  code: string;
  name: string;
  units: number;
  unit_singular: string;
  unit_plural: string;
  validity_months: number | null;
  active: boolean;
  card_version: number;
}

/** Tessera prepagata di un cliente: "pending" finché non viene attivata dopo il pagamento. */
export interface PrepaidCard {
  id: string;
  shop_id: string;
  product_id: string;
  customer_id: string;
  qr_token: string;
  short_code: string;
  status: "pending" | "active";
  balance: number;
  charged_units: number;
  activated_at: string | null;
  expires_at: string | null;
  created_at: string;
  deleted_at: string | null;
}
