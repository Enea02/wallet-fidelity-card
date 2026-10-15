import "server-only";
import { AppError } from "@loyalty/shared/errors";
import { maskPhone } from "@loyalty/shared/logger";
import { getShopById } from "../loyalty";
import { setContext } from "../observability/context";
import { supabaseAdmin } from "../supabase";
import type { Shop } from "../types";

/** Scheda del cliente nella vista Assistenza: nome sì (serve all'assistenza), telefono sempre mascherato. */
export interface CustomerSummary {
  id: string;
  shop: Shop;
  name: string;
  phoneMasked: string | null;
  shortCode: string;
  stamps: number;
  rewards: number;
  consentMarketing: boolean;
  createdAt: string;
  deletedAt: string | null;
  sync: Array<{
    wallet: string;
    synced_stamps: number | null;
    synced_rewards: number | null;
    synced_state: string | null;
    last_success_at: string | null;
    last_error_at: string | null;
    last_error_code: string | null;
    last_error: string | null;
    attempts: number;
    request_id: string | null;
  }>;
}

export async function customerSummary(customerId: string): Promise<CustomerSummary> {
  const db = supabaseAdmin();
  const { data: c, error } = await db
    .from("customers")
    .select(
      "id, shop_id, name, phone, short_code, stamps, rewards_available, consent_marketing, created_at, deleted_at",
    )
    .eq("id", customerId)
    .maybeSingle();
  if (error) throw error;
  if (!c) throw new AppError("E_CARD_NOT_FOUND", `cliente ${customerId} non trovato`, { customer_id: customerId });
  const shop = await getShopById(c.shop_id as string);
  setContext({ shop_id: shop.id, customer_ref: c.short_code as string });
  const { data: sync, error: syncError } = await db
    .from("wallet_sync_state")
    .select(
      "wallet, synced_stamps, synced_rewards, synced_state, last_success_at, last_error_at, last_error_code, last_error, attempts, request_id",
    )
    .eq("customer_id", customerId);
  if (syncError) throw syncError;
  return {
    id: c.id as string,
    shop,
    name: c.name as string,
    phoneMasked: c.phone ? maskPhone(c.phone as string) : null,
    shortCode: c.short_code as string,
    stamps: c.stamps as number,
    rewards: c.rewards_available as number,
    consentMarketing: c.consent_marketing as boolean,
    createdAt: c.created_at as string,
    deletedAt: c.deleted_at as string | null,
    sync: (sync ?? []) as CustomerSummary["sync"],
  };
}

/** Utente staff: email e negozi in cui lavora. */
export async function staffUser(userId: string) {
  const db = supabaseAdmin();
  const [{ data: user, error }, { data: rows, error: e2 }] = await Promise.all([
    db.auth.admin.getUserById(userId),
    db.from("staff").select("shop_id, display_name, role, shops(name)").eq("user_id", userId),
  ]);
  if (error || !user.user) throw new AppError("E_STAFF_NOT_FOUND", `utente ${userId} non trovato`, { user_id: userId });
  if (e2) throw e2;
  return {
    email: user.user.email ?? "",
    lastSignInAt: user.user.last_sign_in_at ?? null,
    memberships: (rows ?? []).map((r) => ({
      shopId: r.shop_id as string,
      shopName: (r.shops as unknown as { name: string } | null)?.name ?? "?",
      displayName: r.display_name as string,
      role: r.role as "owner" | "operator",
    })),
  };
}
