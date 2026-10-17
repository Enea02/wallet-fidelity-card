import "server-only";
import { AppError } from "@loyalty/shared/errors";
import { PREPAID_CARD_COLS, PREPAID_PRODUCT_COLS } from "../db-columns";
import { getShopById } from "../loyalty";
import { callDomain } from "../merchant/domain-call";
import { setContext } from "../observability/context";
import { log } from "../observability/logger";
import { prepaidState } from "../prepaid-state";
import { supabaseAdmin } from "../supabase";
import type { PrepaidCard, PrepaidProduct } from "../types";
import { classifyGoogleError, googleRequest } from "../wallet/google/client";
import { googleEnabled } from "../wallet/google/config";
import { prepaidObjectBody, prepaidObjectIdFor } from "../wallet/google/prepaid-payload";
import { syncPrepaidCard } from "../wallet/prepaid-sync";
import type { FieldCheck, GoogleStatus } from "./card-status";
import type { SupportUser } from "./session";
import { supportMeta } from "./shops";

/*
 * Tessere prepagate nella vista Assistenza (Fase 9.5): riepilogo, stato su Google confrontato con
 * il database e risincronizzazione (audit wallet_resync come support, support.resync).
 */

export async function prepaidSummaryForSupport(cardId: string) {
  const db = supabaseAdmin();
  const { data: card, error } = await db
    .from("prepaid_cards")
    .select(PREPAID_CARD_COLS)
    .eq("id", cardId)
    .maybeSingle<PrepaidCard>();
  if (error) throw error;
  if (!card) throw new AppError("E_CARD_NOT_FOUND", `tessera ${cardId} non trovata`, { card_id: cardId });
  const [shop, product, person, sync] = await Promise.all([
    getShopById(card.shop_id),
    db.from("prepaid_products").select(PREPAID_PRODUCT_COLS).eq("id", card.product_id).single<PrepaidProduct>(),
    db.from("customers").select("id, name, short_code").eq("id", card.customer_id).single(),
    db
      .from("prepaid_sync_state")
      .select(
        "wallet, synced_balance, synced_state, last_success_at, last_error_at, last_error_code, last_error, attempts",
      )
      .eq("card_id", card.id),
  ]);
  for (const r of [product, person, sync]) if (r.error) throw r.error;
  setContext({ shop_id: shop.id, customer_ref: card.short_code });
  return {
    card,
    shop,
    product: product.data!,
    person: person.data as { id: string; name: string; short_code: string },
    state: prepaidState(card, Date.now(), product.data!.kind),
    sync: (sync.data ?? []) as Array<{
      wallet: string;
      synced_balance: number | null;
      synced_state: string | null;
      last_success_at: string | null;
      last_error_at: string | null;
      last_error_code: string | null;
      last_error: string | null;
      attempts: number;
    }>,
  };
}

interface GoogleObject {
  state?: string;
  classId?: string;
  loyaltyPoints?: { balance?: { string?: string } };
  secondaryLoyaltyPoints?: { balance?: { string?: string } };
  textModulesData?: Array<{ id?: string; header?: string }>;
}

export async function googlePrepaidStatus(cardId: string): Promise<GoogleStatus> {
  if (!googleEnabled()) return { kind: "non configurato" };
  const { card, shop, product, person } = await prepaidSummaryForSupport(cardId);
  const want = prepaidObjectBody(shop, product, card, person.name);
  let got: GoogleObject;
  try {
    got = (
      await googleRequest<GoogleObject>({
        operation: "lettura tessera (assistenza)",
        method: "GET",
        path: `/loyaltyObject/${prepaidObjectIdFor(card.id)}`,
        objectId: prepaidObjectIdFor(card.id),
      })
    ).data;
  } catch (e) {
    const f = classifyGoogleError(e);
    if (f.code === "E_GOOGLE_NOT_FOUND") return { kind: "assente" };
    return { kind: "errore", code: f.code, httpStatus: f.httpStatus, detail: f.providerResponse.slice(0, 300) };
  }
  const text = (o: { textModulesData?: Array<{ id?: string; header?: string }> }) =>
    o.textModulesData?.find((m) => m.id === "stato")?.header ?? "—";
  const checks: FieldCheck[] = [
    { label: "Stato", db: want.state, google: got.state ?? "—" },
    { label: "Saldo", db: want.loyaltyPoints.balance.string, google: got.loyaltyPoints?.balance?.string ?? "—" },
    {
      label: "Scadenza",
      db: want.secondaryLoyaltyPoints.balance.string,
      google: got.secondaryLoyaltyPoints?.balance?.string ?? "—",
    },
    { label: "Testo della tessera", db: text(want), google: text(got) },
    { label: "Template", db: want.classId, google: got.classId ?? "—" },
  ].map((c) => ({ ...c, ok: c.db.toUpperCase() === c.google.toUpperCase() }));
  return { kind: "letta", checks, aligned: checks.every((c) => c.ok) };
}

export async function resyncPrepaid(cardId: string, reason: string, user: SupportUser) {
  if (!googleEnabled()) {
    throw new AppError(
      "E_VALIDATION",
      "risincronizzazione chiesta ma Google Wallet non è configurato",
      {},
      {
        userMessage: "Google Wallet non è configurato in questo ambiente: niente da risincronizzare.",
      },
    );
  }
  const { card, shop } = await prepaidSummaryForSupport(cardId);
  await callDomain("support_record", {
    p_meta: supportMeta(user),
    p_shop_id: shop.id,
    p_action: "wallet_resync",
    p_entity: "prepaid_card",
    p_entity_id: card.id,
    p_after: { wallet: "google", scope: "tessera" },
    p_reason: reason,
  });
  const ok = await syncPrepaidCard(card.id, { origin: "resync" });
  log.event(ok ? "support.resync" : "support.resync.failed", {
    support_name: user.name,
    shop_name: shop.name,
    customer_ref: card.short_code,
    cards: 1,
    cards_ok: ok ? 1 : 0,
    template_ok: true,
  });
  return { ok };
}

/** Tessere di un cliente (scheda cliente del pannello). */
export async function prepaidOfCustomer(customerId: string) {
  const { data, error } = await supabaseAdmin()
    .from("prepaid_cards")
    .select("id, short_code, status, balance, expires_at, deleted_at, prepaid_products(name, unit_plural, kind)")
    .eq("customer_id", customerId)
    .order("created_at");
  if (error) throw error;
  return (data ?? []).map((t) => ({
    id: t.id as string,
    shortCode: t.short_code as string,
    product: (t.prepaid_products as unknown as { name: string; unit_plural: string } | null)?.name ?? "tessera",
    unitPlural: (t.prepaid_products as unknown as { unit_plural: string | null } | null)?.unit_plural ?? "",
    state: prepaidState(
      {
        status: t.status as "pending" | "active",
        balance: t.balance as number,
        expires_at: t.expires_at as string | null,
      },
      Date.now(),
      (t.prepaid_products as unknown as { kind: "consumo" | "abbonamento" } | null)?.kind ?? "consumo",
    ),
    balance: t.balance as number,
    deleted: t.deleted_at !== null,
  }));
}
