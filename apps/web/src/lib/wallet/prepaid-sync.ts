import "server-only";
import { PREPAID_CARD_COLS, PREPAID_PRODUCT_COLS } from "../db-columns";
import { log } from "../observability/logger";
import { prepaidState } from "../prepaid-state";
import { supabaseAdmin } from "../supabase";
import type { PrepaidCard, PrepaidProduct, Shop } from "../types";
import { classifyGoogleError, googleRequest } from "./google/client";
import { googleEnabled } from "./google/config";
import { prepaidClassBody, prepaidObjectBody, prepaidSyncedState } from "./google/prepaid-payload";
import { afterFailure, failureFields, isConflict, loadShop, record, type SyncCardOptions } from "./sync";

/*
 * Tessere prepagate su Google Wallet (Fase 9.5): stesso motore delle carte fedeltà (stato completo,
 * esito di ogni tentativo, nuovi tentativi 1/5/15/60 minuti, riconciliazione), su prepaid_sync_state.
 */

const STATE_LABEL = {
  da_attivare: "da attivare",
  attiva: "attiva",
  esaurita: "esaurita",
  scaduta: "scaduta",
} as const;

async function loadProduct(productId: string): Promise<PrepaidProduct> {
  const { data, error } = await supabaseAdmin()
    .from("prepaid_products")
    .select(PREPAID_PRODUCT_COLS)
    .eq("id", productId)
    .single<PrepaidProduct>();
  if (error) throw error;
  return data;
}

async function loadPrepaid(cardId: string) {
  const { data: card, error } = await supabaseAdmin()
    .from("prepaid_cards")
    .select(PREPAID_CARD_COLS)
    .eq("id", cardId)
    .single<PrepaidCard>();
  if (error) throw error;
  const [product, shop, person] = await Promise.all([
    loadProduct(card.product_id),
    loadShop(card.shop_id),
    supabaseAdmin().from("customers").select("name").eq("id", card.customer_id).single(),
  ]);
  if (person.error) throw person.error;
  return { card, product, shop, personName: person.data.name as string };
}

/** Template di un tipo di tessera (LoyaltyClass): crea o aggiorna. */
export async function syncPrepaidClass(productId: string, attempt = 1, shopIn?: Shop): Promise<boolean> {
  if (!googleEnabled()) return false;
  const product = await loadProduct(productId);
  const shop = shopIn ?? (await loadShop(product.shop_id));
  const body = prepaidClassBody(shop, product);
  const base = { shop_name: shop.name, product_name: product.name, class_id: body.id, attempt };
  try {
    let res;
    try {
      res = await googleRequest({
        operation: "aggiornamento template tessera",
        method: "PATCH",
        path: `/loyaltyClass/${body.id}`,
        body,
        attempt,
      });
    } catch (e) {
      if (classifyGoogleError(e).code !== "E_GOOGLE_NOT_FOUND") throw e;
      res = await googleRequest({
        operation: "creazione template tessera",
        method: "POST",
        path: "/loyaltyClass",
        body,
        attempt,
      });
    }
    await record("prepaid_class", shop.id, null, { ok: true }, {}, { productId: product.id });
    log.event("wallet.google.prepaid_class.upsert.ok", { ...base, duration_ms: res.durationMs });
    return true;
  } catch (e) {
    const f = classifyGoogleError(e);
    const rec = await record("prepaid_class", shop.id, null, { ok: false, failure: f }, {}, { productId: product.id });
    log.event("wallet.google.prepaid_class.upsert.failed", {
      ...base,
      duration_ms: f.durationMs,
      ...failureFields(f, rec),
    });
    afterFailure("template della tessera", product.name, f, rec);
    return false;
  }
}

/** Allinea la tessera su Google allo stato attuale del database (saldo, stato, scadenza). */
export async function syncPrepaidCard(cardId: string, opts: SyncCardOptions = {}): Promise<boolean> {
  if (!googleEnabled()) return false;
  const attempt = opts.attempt ?? 1;
  const { card, product, shop, personName } = await loadPrepaid(cardId);
  const body = prepaidObjectBody(shop, product, card, personName);
  const state = prepaidState(card, Date.now(), product.kind);
  const fields = {
    customer_ref: card.short_code,
    shop_name: shop.name,
    product_name: product.name,
    unit_singular: product.unit_singular ?? "",
    unit_plural: product.unit_plural ?? "",
    balance: card.balance,
    prepaid_state: card.deleted_at || shop.status !== "active" ? ("disattivata" as const) : STATE_LABEL[state],
    attempt,
  };
  const ids = { cardId: card.id };
  const synced = {
    balance: card.balance,
    state: prepaidSyncedState(shop, card, product.kind),
    version: product.card_version + shop.card_version,
  };

  try {
    let res;
    try {
      res = await googleRequest({
        operation: "aggiornamento tessera",
        method: "PATCH",
        path: `/loyaltyObject/${body.id}`,
        body,
        objectId: body.id,
        attempt,
      });
    } catch (e) {
      if (classifyGoogleError(e).code !== "E_GOOGLE_NOT_FOUND") throw e;
      const post = () =>
        googleRequest({
          operation: "creazione tessera",
          method: "POST",
          path: "/loyaltyObject",
          body,
          objectId: body.id,
          attempt,
        });
      try {
        res = await post();
      } catch (e2) {
        if (isConflict(e2)) {
          res = await googleRequest({
            operation: "aggiornamento tessera",
            method: "PATCH",
            path: `/loyaltyObject/${body.id}`,
            body,
            objectId: body.id,
            attempt,
          });
        } else {
          if (classifyGoogleError(e2).code !== "E_GOOGLE_NOT_FOUND") throw e2;
          // manca il template del tipo di tessera: lo si crea e si riprova una volta
          await syncPrepaidClass(product.id, 1, shop);
          res = await post();
        }
      }
    }
    await record("prepaid_object", shop.id, null, { ok: true, synced }, {}, ids);
    log.event("wallet.google.prepaid.upsert.ok", { ...fields, duration_ms: res.durationMs });
    if (opts.reconcileReason) {
      log.event("wallet.sync.reconciled", {
        customer_ref: card.short_code,
        shop_name: shop.name,
        reason: opts.reconcileReason,
      });
    }
    return true;
  } catch (e) {
    const f = classifyGoogleError(e);
    const rec = await record("prepaid_object", shop.id, null, { ok: false, failure: f }, {}, ids);
    log.event("wallet.google.prepaid.upsert.failed", {
      ...fields,
      duration_ms: f.durationMs,
      ...failureFields(f, rec),
    });
    afterFailure("tessera", card.short_code, f, rec);
    return false;
  }
}

/** Tessere rimaste indietro su Google: le riallinea (al massimo `limit`). */
export async function reconcilePrepaid(limit: number): Promise<number> {
  if (!googleEnabled()) return 0;
  const { data, error } = await supabaseAdmin().rpc("prepaid_sync_drifted", { p_limit: limit });
  if (error) throw error;
  let ok = 0;
  for (const row of (data ?? []) as Array<{ card_id: string; reason: string }>) {
    if (await syncPrepaidCard(row.card_id, { origin: "reconcile", reconcileReason: row.reason })) ok += 1;
  }
  return ok;
}

/** Template di tutti i tipi di tessera del negozio (dopo un cambio di colore, logo o nome). */
export async function syncShopPrepaidClasses(shop: Shop): Promise<{ total: number; ok: number }> {
  const { data, error } = await supabaseAdmin().from("prepaid_products").select("id").eq("shop_id", shop.id);
  if (error) throw error;
  let ok = 0;
  for (const p of data ?? []) if (await syncPrepaidClass(p.id as string, 1, shop)) ok += 1;
  return { total: (data ?? []).length, ok };
}

/** Risincronizza template e tessere del negozio (assistenza). */
export async function resyncShopPrepaid(shop: Shop): Promise<{ cards: number; ok: number; classesOk: boolean }> {
  const classes = await syncShopPrepaidClasses(shop);
  const { data, error } = await supabaseAdmin()
    .from("prepaid_cards")
    .select("id")
    .eq("shop_id", shop.id)
    .order("created_at");
  if (error) throw error;
  let ok = 0;
  for (const c of data ?? []) if (await syncPrepaidCard(c.id as string, { origin: "resync" })) ok += 1;
  return { cards: (data ?? []).length, ok, classesOk: classes.ok === classes.total };
}
