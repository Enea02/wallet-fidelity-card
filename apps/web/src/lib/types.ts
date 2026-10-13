export interface Shop {
  id: string;
  slug: string;
  name: string;
  stamps_required: number;
  reward_label: string;
  logo_url: string | null;
  hex_color: string;
}

export interface Customer {
  id: string;
  shop_id: string;
  name: string;
  phone: string;
  qr_token: string;
  stamps: number;
  rewards_available: number;
}

/** Stato della carta che i wallet devono mostrare. */
export interface CardState {
  shop: Shop;
  customer: Customer;
}
