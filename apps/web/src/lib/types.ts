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
  privacy_email: string | null;
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
