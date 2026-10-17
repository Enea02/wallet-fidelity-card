import "server-only";
import { AppError } from "@loyalty/shared/errors";
import { CUSTOMER_COLS } from "../db-columns";
import { getShopById } from "../loyalty";
import { callDomain } from "../merchant/domain-call";
import { setContext } from "../observability/context";
import { log } from "../observability/logger";
import { classifyGoogleError, googleRequest } from "../wallet/google/client";
import { googleEnabled, objectIdFor } from "../wallet/google/config";
import { objectBody } from "../wallet/google/payload";
import { supabaseAdmin } from "../supabase";
import type { Customer } from "../types";
import { resyncShop, syncCard } from "../wallet/sync";
import type { SupportUser } from "./session";
import { supportMeta } from "./shops";

/*
 * Stato della carta su Google Wallet letto in diretta e confrontato con quello che il database
 * dice di mostrare; "Risincronizza" rimanda a Google lo stato completo (azione tracciata in audit
 * come support, esito in support.resync). Apple Wallet arriva con la Fase 12.
 */

export interface FieldCheck {
  label: string;
  db: string;
  google: string;
  ok: boolean;
}

export type GoogleStatus =
  | { kind: "non configurato" }
  | { kind: "assente" }
  | { kind: "errore"; code: string; httpStatus: number | null; detail: string }
  | { kind: "letta"; checks: FieldCheck[]; aligned: boolean };

interface GoogleObject {
  state?: string;
  classId?: string;
  accountId?: string;
  loyaltyPoints?: { balance?: { string?: string } };
  secondaryLoyaltyPoints?: { balance?: { string?: string } };
  textModulesData?: Array<{ id?: string; header?: string; body?: string }>;
}

/** Carta anche se cancellata: l'assistenza deve poter verificare che su Google sia disattivata. */
async function anyCustomer(shopId: string, customerId: string): Promise<Customer> {
  const { data, error } = await supabaseAdmin()
    .from("customers")
    .select(CUSTOMER_COLS)
    .eq("shop_id", shopId)
    .eq("id", customerId)
    .maybeSingle();
  if (error) throw error;
  if (!data)
    throw new AppError("E_CARD_NOT_FOUND", `nessuna carta ${customerId} nel negozio ${shopId}`, { shop_id: shopId });
  return data as Customer;
}

export async function googleCardStatus(shopId: string, customerId: string): Promise<GoogleStatus> {
  if (!googleEnabled()) return { kind: "non configurato" };
  const [shop, customer] = await Promise.all([getShopById(shopId), anyCustomer(shopId, customerId)]);
  const want = objectBody(shop, customer);
  let got: GoogleObject;
  try {
    got = (
      await googleRequest<GoogleObject>({
        operation: "lettura carta (assistenza)",
        method: "GET",
        path: `/loyaltyObject/${objectIdFor(customer.id)}`,
        objectId: objectIdFor(customer.id),
      })
    ).data;
  } catch (e) {
    const f = classifyGoogleError(e);
    if (f.code === "E_GOOGLE_NOT_FOUND") return { kind: "assente" };
    return { kind: "errore", code: f.code, httpStatus: f.httpStatus, detail: f.providerResponse.slice(0, 300) };
  }
  const statusText = (o: { textModulesData?: Array<{ id?: string; header?: string }> }) =>
    o.textModulesData?.find((m) => m.id === "stato")?.header ?? "—";
  const checks: FieldCheck[] = [
    { label: "Stato", db: want.state, google: got.state ?? "—" },
    {
      label: want.loyaltyPoints.label,
      db: want.loyaltyPoints.balance.string,
      google: got.loyaltyPoints?.balance?.string ?? "—",
    },
    {
      label: want.secondaryLoyaltyPoints.label,
      db: want.secondaryLoyaltyPoints.balance.string,
      google: got.secondaryLoyaltyPoints?.balance?.string ?? "—",
    },
    { label: "Testo della carta", db: statusText(want), google: statusText(got) },
    { label: "Template del negozio", db: want.classId, google: got.classId ?? "—" },
  ].map((c) => ({ ...c, ok: c.db.toUpperCase() === c.google.toUpperCase() }));
  return { kind: "letta", checks, aligned: checks.every((c) => c.ok) };
}

function requireGoogle() {
  if (!googleEnabled()) {
    throw new AppError(
      "E_VALIDATION",
      "risincronizzazione chiesta ma Google Wallet non è configurato in questo ambiente",
      {},
      { userMessage: "Google Wallet non è configurato in questo ambiente: niente da risincronizzare." },
    );
  }
}

export async function resyncCard(shopId: string, customerId: string, reason: string, user: SupportUser) {
  requireGoogle();
  const [shop, customer] = await Promise.all([getShopById(shopId), anyCustomer(shopId, customerId)]);
  setContext({ shop_id: shop.id, customer_ref: customer.short_code });
  await callDomain("support_record", {
    p_meta: supportMeta(user),
    p_shop_id: shop.id,
    p_action: "wallet_resync",
    p_entity: "customer",
    p_entity_id: customer.id,
    p_after: { wallet: "google", scope: "carta" },
    p_reason: reason,
  });
  const ok = await syncCard(customer.id, { origin: "resync" });
  const fields = {
    support_name: user.name,
    shop_name: shop.name,
    customer_ref: customer.short_code,
    cards: 1,
    cards_ok: ok ? 1 : 0,
    template_ok: true,
  };
  log.event(ok ? "support.resync" : "support.resync.failed", fields);
  return { ok };
}

export async function resyncWholeShop(shopId: string, reason: string, user: SupportUser) {
  requireGoogle();
  const shop = await getShopById(shopId);
  setContext({ shop_id: shop.id });
  await callDomain("support_record", {
    p_meta: supportMeta(user),
    p_shop_id: shop.id,
    p_action: "wallet_resync",
    p_entity: "shop",
    p_entity_id: shop.id,
    p_after: { wallet: "google", scope: "negozio" },
    p_reason: reason,
  });
  const r = await resyncShop(shop.id);
  const fields = {
    support_name: user.name,
    shop_name: shop.name,
    customer_ref: null,
    cards: r.cards,
    cards_ok: r.ok,
    template_ok: r.classOk,
  };
  log.event(r.classOk && r.ok === r.cards ? "support.resync" : "support.resync.failed", fields);
  return r;
}
