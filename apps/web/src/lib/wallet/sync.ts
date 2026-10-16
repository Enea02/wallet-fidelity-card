import "server-only";
import type { ErrorCode } from "@loyalty/shared/errors";
import { CUSTOMER_COLS, SHOP_COLS } from "../db-columns";
import { getContext } from "../observability/context";
import { log } from "../observability/logger";
import { supabaseAdmin } from "../supabase";
import type { Customer, Shop } from "../types";
import { classifyGoogleError, googleRequest, type GoogleFailure } from "./google/client";
import { classIdFor, googleEnabled, objectIdFor } from "./google/config";
import { cardStateFor, classBody, objectBody } from "./google/payload";
import { reconcilePrepaid, resyncShopPrepaid, syncPrepaidCard, syncPrepaidClass } from "./prepaid-sync";

/*
 * Motore di sincronizzazione con Google Wallet. Invia sempre lo stato completo (idempotente),
 * registra ogni tentativo in wallet_sync_state / wallet_sync_failures e, se fallisce, pianifica
 * il prossimo (1, 5, 15, 60 minuti, poi esaurito). Non lancia mai per errori di Google: li
 * registra con gli eventi wallet.google.* e restituisce false.
 */

export interface RecordResult {
  attempt?: number;
  retry_in_min?: number | null;
  next_retry_at?: string | null;
  exhausted?: boolean;
}

const GOOGLE_WHY: Partial<Record<ErrorCode, string>> = {
  E_GOOGLE_AUTH: "credenziali rifiutate",
  E_GOOGLE_NOT_FOUND: "non trovato",
  E_GOOGLE_QUOTA: "quota superata",
  E_GOOGLE_INVALID_PAYLOAD: "dati rifiutati",
  E_GOOGLE_UNAVAILABLE: "Google non risponde",
};

export async function record(
  kind: "object" | "class" | "message" | "prepaid_object" | "prepaid_class",
  shopId: string,
  customerId: string | null,
  outcome: { ok: true; synced?: Record<string, unknown> } | { ok: false; failure: GoogleFailure },
  payload: Record<string, unknown> = {},
  prepaid: { cardId?: string; productId?: string } = {},
): Promise<RecordResult> {
  const { data, error } = await supabaseAdmin().rpc("wallet_sync_record", {
    p_kind: kind,
    p_wallet: "google",
    p_shop_id: shopId,
    p_customer_id: customerId,
    p_ok: outcome.ok,
    p_synced: outcome.ok ? (outcome.synced ?? {}) : {},
    p_error_code: outcome.ok ? null : outcome.failure.code,
    p_error: outcome.ok
      ? null
      : `status ${outcome.failure.httpStatus ?? "nessuna risposta"}: ${outcome.failure.providerResponse}`,
    p_request_id: getContext()?.request_id ?? null,
    p_payload: payload,
    p_prepaid_card_id: prepaid.cardId ?? null,
    p_prepaid_product_id: prepaid.productId ?? null,
  });
  if (error) throw error;
  return data as RecordResult;
}

export const failureFields = (f: GoogleFailure, rec: RecordResult) => ({
  http_status: f.httpStatus,
  error_code: f.code,
  provider_response: f.providerResponse,
  retry_in_min: rec.exhausted ? null : (rec.retry_in_min ?? null),
});

/** Dopo un errore: riga di nuovo tentativo pianificato, oppure di tentativi esauriti. */
export function afterFailure(targetKind: string, target: string, f: GoogleFailure, rec: RecordResult): void {
  if (rec.exhausted) {
    log.event("wallet.sync.retry.exhausted", {
      target_kind: targetKind,
      target,
      attempts: rec.attempt ?? 0,
      error_code: f.code,
      last_error: `${GOOGLE_WHY[f.code] ?? "errore"}, status ${f.httpStatus ?? "nessuna risposta"}`,
    });
  } else if (rec.retry_in_min && rec.next_retry_at) {
    log.event("wallet.sync.retry.scheduled", {
      target_kind: targetKind,
      target,
      next_attempt: (rec.attempt ?? 0) + 1,
      retry_in_min: rec.retry_in_min,
      retry_at: new Date(rec.next_retry_at).toISOString(),
      error_code: f.code,
    });
  }
}

export async function loadShop(shopId: string): Promise<Shop> {
  const { data, error } = await supabaseAdmin().from("shops").select(SHOP_COLS).eq("id", shopId).single<Shop>();
  if (error) throw error;
  return data;
}

async function loadCard(customerId: string): Promise<{ shop: Shop; customer: Customer }> {
  const { data, error } = await supabaseAdmin()
    .from("customers")
    .select(CUSTOMER_COLS)
    .eq("id", customerId)
    .single<Customer>();
  if (error) throw error;
  return { customer: data, shop: await loadShop(data.shop_id) };
}

export const isConflict = (e: unknown) =>
  typeof e === "object" && e !== null && (e as { context?: { http_status?: unknown } }).context?.http_status === 409;

/* ------------------------------------------------------------------ */
/* Template del negozio (LoyaltyClass)                                 */
/* ------------------------------------------------------------------ */

export async function syncClass(shopOrId: Shop | string, attempt = 1): Promise<boolean> {
  if (!googleEnabled()) return false;
  const shop = typeof shopOrId === "string" ? await loadShop(shopOrId) : shopOrId;
  const body = classBody(shop);
  const base = { shop_name: shop.name, class_id: body.id, attempt };
  try {
    let res;
    try {
      res = await googleRequest({
        operation: "aggiornamento template",
        method: "PATCH",
        path: `/loyaltyClass/${body.id}`,
        body,
        attempt,
      });
    } catch (e) {
      if (classifyGoogleError(e).code !== "E_GOOGLE_NOT_FOUND") throw e;
      res = await googleRequest({
        operation: "creazione template",
        method: "POST",
        path: "/loyaltyClass",
        body,
        attempt,
      });
    }
    await record("class", shop.id, null, { ok: true });
    log.event("wallet.google.class.upsert.ok", { ...base, duration_ms: res.durationMs });
    return true;
  } catch (e) {
    const f = classifyGoogleError(e);
    const rec = await record("class", shop.id, null, { ok: false, failure: f });
    log.event("wallet.google.class.upsert.failed", { ...base, duration_ms: f.durationMs, ...failureFields(f, rec) });
    afterFailure("template del negozio", shop.name, f, rec);
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Carta del cliente (LoyaltyObject)                                   */
/* ------------------------------------------------------------------ */

export interface SyncCardOptions {
  attempt?: number;
  /** "delete" = cancellazione del cliente: se la carta diventa INACTIVE si registra wallet.card.deactivated. */
  origin?: "change" | "delete" | "retry" | "reconcile" | "resync";
  /** Per la riconciliazione: che cosa era diverso. */
  reconcileReason?: string;
}

async function createObject(shop: Shop, body: ReturnType<typeof objectBody>, attempt: number) {
  const post = () =>
    googleRequest({
      operation: "creazione carta",
      method: "POST",
      path: "/loyaltyObject",
      body,
      objectId: body.id,
      attempt,
    });
  try {
    return await post();
  } catch (e) {
    if (isConflict(e)) {
      // creata nel frattempo (es. dal link "Salva in Google Wallet"): si aggiorna
      return googleRequest({
        operation: "aggiornamento carta",
        method: "PATCH",
        path: `/loyaltyObject/${body.id}`,
        body,
        objectId: body.id,
        attempt,
      });
    }
    if (classifyGoogleError(e).code !== "E_GOOGLE_NOT_FOUND") throw e;
    // manca il template del negozio: lo si crea e si riprova una volta
    await syncClass(shop);
    return post();
  }
}

/** Allinea la carta su Google allo stato attuale del database. */
export async function syncCard(customerId: string, opts: SyncCardOptions = {}): Promise<boolean> {
  if (!googleEnabled()) return false;
  const attempt = opts.attempt ?? 1;
  const { shop, customer } = await loadCard(customerId);
  const body = objectBody(shop, customer);
  const state = cardStateFor(shop, customer);
  const fields = {
    customer_ref: customer.short_code,
    shop_name: shop.name,
    stamps: customer.stamps,
    stamps_required: shop.stamps_required,
    rewards: customer.rewards_available,
    card_state: state,
    attempt,
  };

  let created = false;
  try {
    let res;
    try {
      res = await googleRequest({
        operation: "aggiornamento carta",
        method: "PATCH",
        path: `/loyaltyObject/${body.id}`,
        body,
        objectId: body.id,
        attempt,
      });
    } catch (e) {
      if (classifyGoogleError(e).code !== "E_GOOGLE_NOT_FOUND") throw e;
      created = true;
      res = await createObject(shop, body, attempt);
    }
    await record("object", shop.id, customer.id, {
      ok: true,
      synced: { stamps: customer.stamps, rewards: customer.rewards_available, state, version: shop.card_version },
    });
    log.event(created ? "wallet.google.object.upsert.ok" : "wallet.google.patch.ok", {
      ...fields,
      duration_ms: res.durationMs,
    });
    if (state === "INACTIVE" && (opts.origin === "delete" || opts.reconcileReason === "stato")) {
      log.event("wallet.card.deactivated", {
        customer_ref: customer.short_code,
        shop_name: shop.name,
        reason: customer.deleted_at ? "cliente cancellato" : "negozio sospeso",
      });
    }
    if (opts.reconcileReason) {
      log.event("wallet.sync.reconciled", {
        customer_ref: customer.short_code,
        shop_name: shop.name,
        reason: opts.reconcileReason,
      });
    }
    return true;
  } catch (e) {
    const f = classifyGoogleError(e);
    const rec = await record("object", shop.id, customer.id, { ok: false, failure: f });
    log.event(created ? "wallet.google.object.upsert.failed" : "wallet.google.patch.failed", {
      ...fields,
      duration_ms: f.durationMs,
      ...failureFields(f, rec),
    });
    afterFailure("carta", customer.short_code, f, rec);
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Messaggi con notifica                                               */
/* ------------------------------------------------------------------ */

export interface CardMessage {
  /** Id deterministico: un nuovo tentativo non duplica il messaggio (Google risponde 409). */
  id: string;
  header: string;
  body: string;
  /** "premio sbloccato" | "promozione" */
  kind: string;
}

export type MessageResult = { ok: true } | { ok: false; failure: GoogleFailure };

/**
 * Invia un messaggio con notifica alla carta. track=true: in caso di errore entra nella coda dei
 * tentativi (wallet_sync_failures); false: i tentativi li gestisce chi chiama (promozioni).
 */
export async function sendCardMessage(
  customerId: string,
  msg: CardMessage,
  opts: { attempt?: number; track?: boolean; retryInMin?: (failure: GoogleFailure) => number | null } = {},
): Promise<MessageResult> {
  if (!googleEnabled()) return { ok: true };
  const attempt = opts.attempt ?? 1;
  const { shop, customer } = await loadCard(customerId);
  const objectId = objectIdFor(customer.id);
  const base = {
    customer_ref: customer.short_code,
    shop_name: shop.name,
    message_kind: msg.kind,
    message_id: msg.id,
    attempt,
  };
  const payload = { message_id: msg.id, header: msg.header, body: msg.body, message_kind: msg.kind };
  try {
    let durationMs = 0;
    try {
      const res = await googleRequest({
        operation: `notifica ${msg.kind}`,
        method: "POST",
        path: `/loyaltyObject/${objectId}/addMessage`,
        body: { message: { id: msg.id, header: msg.header, body: msg.body, messageType: "TEXT_AND_NOTIFY" } },
        objectId,
        attempt,
      });
      durationMs = res.durationMs;
    } catch (e) {
      if (!isConflict(e)) throw e; // 409: messaggio con questo id già presente, cioè già inviato
    }
    if (opts.track) await record("message", shop.id, customer.id, { ok: true }, payload);
    log.event("wallet.google.message.sent", { ...base, duration_ms: durationMs });
    return { ok: true };
  } catch (e) {
    const f = classifyGoogleError(e);
    const rec: RecordResult = opts.track
      ? await record("message", shop.id, customer.id, { ok: false, failure: f }, payload)
      : { retry_in_min: opts.retryInMin?.(f) ?? null, exhausted: opts.retryInMin?.(f) === null };
    log.event("wallet.google.message.failed", { ...base, duration_ms: f.durationMs, ...failureFields(f, rec) });
    if (opts.track) afterFailure("messaggio", customer.short_code, f, rec);
    return { ok: false, failure: f };
  }
}

/* ------------------------------------------------------------------ */
/* Lavori del cron e dell'assistenza                                   */
/* ------------------------------------------------------------------ */

interface FailureRow {
  kind: "object" | "class" | "message" | "prepaid_object" | "prepaid_class";
  shop_id: string;
  customer_id: string | null;
  prepaid_card_id: string | null;
  prepaid_product_id: string | null;
  attempt: number;
  payload: { message_id?: string; header?: string; body?: string; message_kind?: string };
}

/** Rifà i tentativi scaduti (al massimo `limit`). Restituisce quanti e quanti riusciti. */
export async function processDueRetries(limit: number): Promise<{ total: number; ok: number }> {
  if (!googleEnabled()) return { total: 0, ok: 0 };
  const { data, error } = await supabaseAdmin().rpc("wallet_sync_claim_due", { p_limit: limit });
  if (error) throw error;
  let ok = 0;
  for (const row of (data ?? []) as FailureRow[]) {
    const attempt = row.attempt + 1;
    const done =
      row.kind === "prepaid_class" && row.prepaid_product_id
        ? await syncPrepaidClass(row.prepaid_product_id, attempt)
        : row.kind === "prepaid_object" && row.prepaid_card_id
          ? await syncPrepaidCard(row.prepaid_card_id, { attempt, origin: "retry" })
          : row.kind === "class"
            ? await syncClass(row.shop_id, attempt)
            : row.kind === "message" && row.customer_id
              ? (
                  await sendCardMessage(
                    row.customer_id,
                    {
                      id: row.payload.message_id ?? "",
                      header: row.payload.header ?? "",
                      body: row.payload.body ?? "",
                      kind: row.payload.message_kind ?? "messaggio",
                    },
                    { attempt, track: true },
                  )
                ).ok
              : row.customer_id
                ? await syncCard(row.customer_id, { attempt, origin: "retry" })
                : false;
    if (done) ok += 1;
  }
  return { total: (data ?? []).length, ok };
}

/** Riallinea carte e tessere rimaste indietro rispetto al database (saldo, stato, impostazioni). */
export async function reconcile(limit: number): Promise<number> {
  if (!googleEnabled()) return 0;
  const { data, error } = await supabaseAdmin().rpc("wallet_sync_drifted", { p_limit: limit });
  if (error) throw error;
  let ok = 0;
  for (const row of (data ?? []) as Array<{ customer_id: string; reason: string }>) {
    if (await syncCard(row.customer_id, { origin: "reconcile", reconcileReason: row.reason })) ok += 1;
  }
  return ok + (await reconcilePrepaid(limit));
}

/** Risincronizza template e tutte le carte di un negozio (es. dopo sospensione/riattivazione). */
export async function resyncShop(shopId: string): Promise<{ cards: number; ok: number; classOk: boolean }> {
  const shop = await loadShop(shopId);
  // carta fedeltà solo se il negozio la offre; tessere prepagate sempre (Fase 9.5)
  let classOk = true;
  let cards = 0;
  let ok = 0;
  if (shop.loyalty_enabled) {
    classOk = await syncClass(shop);
    const { data, error } = await supabaseAdmin()
      .from("customers")
      .select("id")
      .eq("shop_id", shopId)
      .order("created_at");
    if (error) throw error;
    cards = (data ?? []).length;
    for (const c of data ?? []) if (await syncCard(c.id as string, { origin: "resync" })) ok += 1;
  }
  const prepaid = await resyncShopPrepaid(shop);
  return { cards: cards + prepaid.cards, ok: ok + prepaid.ok, classOk: classOk && prepaid.classesOk };
}

export { classIdFor };
