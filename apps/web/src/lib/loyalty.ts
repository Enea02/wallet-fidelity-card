import "server-only";
import { supabaseAdmin } from "./supabase";
import { AppError } from "@loyalty/shared/errors";
import { setContext } from "./observability/context";
import type { Customer, Shop } from "./types";
import { googleEnabled, upsertLoyaltyObject, saveUrl } from "./wallet/google";
import { notifyCardChanged } from "./wallet/notifier";

const SHOP_COLS = "id, slug, name, stamps_required, reward_label, logo_url, hex_color";
const CUSTOMER_COLS = "id, shop_id, name, phone, qr_token, stamps, rewards_available";

export async function getShopBySlug(slug: string): Promise<Shop | null> {
  const { data, error } = await supabaseAdmin().from("shops").select(SHOP_COLS).eq("slug", slug).maybeSingle();
  if (error) throw error;
  return data as Shop | null;
}

export async function getShopById(id: string): Promise<Shop> {
  const { data, error } = await supabaseAdmin().from("shops").select(SHOP_COLS).eq("id", id).single();
  if (error) throw error;
  return data as Shop;
}

/** Il QR scansionato vale solo dentro il negozio dello staff. */
export async function getCustomerByQr(shopId: string, qrToken: string): Promise<Customer> {
  const { data, error } = await supabaseAdmin()
    .from("customers")
    .select(CUSTOMER_COLS)
    .eq("shop_id", shopId)
    .eq("qr_token", qrToken)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    throw new AppError("E_CARD_NOT_FOUND", `nessuna carta del negozio ${shopId} con il QR scansionato`, {
      shop_id: shopId,
    });
  }
  setContext({ customer_ref: data.id });
  return data as Customer;
}

export interface EnrollInput {
  shopSlug: string;
  name: string;
  phone: string;
  consentPrivacy: boolean;
  consentMarketing: boolean;
}

/**
 * Iscrive il cliente (o ritrova quello esistente con lo stesso telefono),
 * crea la carta su Google e restituisce il link "Salva in Wallet".
 */
export async function enroll(input: EnrollInput) {
  const shop = await getShopBySlug(input.shopSlug);
  if (!shop) throw new AppError("E_SHOP_NOT_FOUND", `nessun negozio con slug "${input.shopSlug}"`);
  setContext({ shop_id: shop.id });
  if (!input.consentPrivacy) {
    throw new AppError("E_PRIVACY_CONSENT_REQUIRED", "iscrizione senza consenso privacy");
  }

  const db = supabaseAdmin();
  const { data: existing } = await db
    .from("customers")
    .select(CUSTOMER_COLS)
    .eq("shop_id", shop.id)
    .eq("phone", input.phone)
    .maybeSingle();

  let customer = existing as Customer | null;
  if (!customer) {
    const { data, error } = await db
      .from("customers")
      .insert({
        shop_id: shop.id,
        name: input.name,
        phone: input.phone,
        consent_privacy: input.consentPrivacy,
        consent_marketing: input.consentMarketing,
      })
      .select(CUSTOMER_COLS)
      .single();
    if (error) throw error;
    customer = data as Customer;
  }
  setContext({ customer_ref: customer.id });

  if (!googleEnabled()) return { googleSaveUrl: null };
  await upsertLoyaltyObject({ shop, customer });
  return { googleSaveUrl: saveUrl(customer.id, shop) };
}

export async function addStamp(shopId: string, qrToken: string, staffUserId: string) {
  const customer = await getCustomerByQr(shopId, qrToken);
  const { data, error } = await supabaseAdmin()
    .rpc("add_stamp", { p_customer_id: customer.id, p_staff_user_id: staffUserId })
    .single<{ stamps: number; rewards_available: number; reward_unlocked: boolean }>();
  if (error) throw error;

  const shop = await getShopById(shopId);
  const updated: Customer = { ...customer, stamps: data.stamps, rewards_available: data.rewards_available };
  await notifyCardChanged({ shop, customer: updated }, { kind: "stamp", rewardUnlocked: data.reward_unlocked });

  return { customer: publicView(updated, shop), rewardUnlocked: data.reward_unlocked };
}

export async function redeem(shopId: string, qrToken: string, staffUserId: string) {
  const customer = await getCustomerByQr(shopId, qrToken);
  const { data, error } = await supabaseAdmin()
    .rpc("redeem_reward", { p_customer_id: customer.id, p_staff_user_id: staffUserId })
    .single<{ stamps: number; rewards_available: number }>();
  if (error) {
    if (error.message.includes("no_reward_available")) {
      throw new AppError("E_NO_REWARD", `la carta ${customer.id} non ha premi da riscattare`);
    }
    throw error;
  }

  const shop = await getShopById(shopId);
  const updated: Customer = { ...customer, stamps: data.stamps, rewards_available: data.rewards_available };
  await notifyCardChanged({ shop, customer: updated }, { kind: "redeem", rewardUnlocked: false });

  return { customer: publicView(updated, shop) };
}

/** Cosa vede lo staff dopo la scansione (niente telefono/id interni). */
export function publicView(c: Customer, shop: Shop) {
  return {
    name: c.name,
    stamps: c.stamps,
    stampsRequired: shop.stamps_required,
    rewardsAvailable: c.rewards_available,
    rewardLabel: shop.reward_label,
  };
}
