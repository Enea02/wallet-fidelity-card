import "server-only";
import type { PrepaidView } from "@loyalty/shared/api";
import { AppError } from "@loyalty/shared/errors";
import type { ActorFields, PrepaidWalletState } from "@loyalty/shared/logging/events";
import { PREPAID_CARD_COLS, PREPAID_PRODUCT_COLS } from "./db-columns";
import { actorFields, onRejected } from "./loyalty";
import { callDomain, domainMeta } from "./merchant/domain-call";
import { setContext } from "./observability/context";
import { log } from "./observability/logger";
import { prepaidState, prepaidView } from "./prepaid-state";
import { supabaseAdmin } from "./supabase";
import type { PrepaidCard, PrepaidProduct, Shop } from "./types";
import { notifyPrepaidChanged, notifyPrepaidProductChanged } from "./wallet/notifier";

/*
 * Tessere prepagate a consumo (Fase 9.5). Il pagamento avviene fuori dall'app: "attiva" e "ricarica"
 * significano "pagamento ricevuto". Ogni modifica passa dalle funzioni Postgres (prepaid_*), che
 * scrivono audit_log; qui si risolvono le tessere, si scrivono gli eventi di log e si avvisa il wallet.
 */

const STATE_LABEL: Record<PrepaidView["state"], PrepaidWalletState> = {
  da_attivare: "da attivare",
  attiva: "attiva",
  esaurita: "esaurita",
  scaduta: "scaduta",
};

const cardFields = (c: PrepaidCard, p: PrepaidProduct, shop: Shop) => ({
  customer_ref: c.short_code,
  shop_name: shop.name,
  product_name: p.name,
  unit_singular: p.unit_singular,
  unit_plural: p.unit_plural,
});

/* ------------------------------------------------------------------ */
/* Lettura                                                             */
/* ------------------------------------------------------------------ */

export async function getProduct(shopId: string, productId: string): Promise<PrepaidProduct> {
  const { data, error } = await supabaseAdmin()
    .from("prepaid_products")
    .select(PREPAID_PRODUCT_COLS)
    .eq("shop_id", shopId)
    .eq("id", productId)
    .maybeSingle<PrepaidProduct>();
  if (error) throw error;
  if (!data) {
    throw new AppError("E_PREPAID_PRODUCT_NOT_FOUND", `nessun tipo di tessera ${productId} nel negozio ${shopId}`);
  }
  return data;
}

export async function getProductByCode(shopId: string, code: string): Promise<PrepaidProduct | null> {
  const { data, error } = await supabaseAdmin()
    .from("prepaid_products")
    .select(PREPAID_PRODUCT_COLS)
    .eq("shop_id", shopId)
    .eq("code", code)
    .maybeSingle<PrepaidProduct>();
  if (error) throw error;
  return data;
}

/** Tessere disponibili del negozio (pagina pubblica). */
export async function activeProducts(shopId: string): Promise<PrepaidProduct[]> {
  const { data, error } = await supabaseAdmin()
    .from("prepaid_products")
    .select(PREPAID_PRODUCT_COLS)
    .eq("shop_id", shopId)
    .eq("active", true)
    .order("created_at");
  if (error) throw error;
  return (data ?? []) as PrepaidProduct[];
}

async function personName(customerId: string): Promise<string> {
  const { data, error } = await supabaseAdmin().from("customers").select("name").eq("id", customerId).single();
  if (error) throw error;
  return data.name as string;
}

/** Tessera del negozio (anche cancellata se allowDeleted), con tipo di tessera e nome del cliente. */
export async function getPrepaid(shopId: string, cardId: string, allowDeleted = false) {
  const { data, error } = await supabaseAdmin()
    .from("prepaid_cards")
    .select(PREPAID_CARD_COLS)
    .eq("shop_id", shopId)
    .eq("id", cardId)
    .maybeSingle<PrepaidCard>();
  if (error) throw error;
  if (!data || (data.deleted_at && !allowDeleted)) {
    throw new AppError("E_CARD_NOT_FOUND", `nessuna tessera ${cardId} nel negozio ${shopId}`, { shop_id: shopId });
  }
  const [product, name] = await Promise.all([getProduct(shopId, data.product_id), personName(data.customer_id)]);
  setContext({ customer_ref: data.short_code });
  return { card: data, product, name };
}

/** Tessere di un cliente nel negozio (scheda cliente). */
export async function prepaidCardsOf(shopId: string, customerId: string): Promise<PrepaidView[]> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("prepaid_cards")
    .select(PREPAID_CARD_COLS)
    .eq("shop_id", shopId)
    .eq("customer_id", customerId)
    .is("deleted_at", null)
    .order("created_at");
  if (error) throw error;
  const cards = (data ?? []) as PrepaidCard[];
  if (cards.length === 0) return [];
  const [name, products] = await Promise.all([
    personName(customerId),
    db
      .from("prepaid_products")
      .select(PREPAID_PRODUCT_COLS)
      .in("id", [...new Set(cards.map((c) => c.product_id))]),
  ]);
  if (products.error) throw products.error;
  const byId = new Map(((products.data ?? []) as PrepaidProduct[]).map((p) => [p.id, p]));
  return cards.map((c) => prepaidView(c, byId.get(c.product_id)!, name));
}

/**
 * Scansione: tessera del negozio con quel QR o codice breve, null se non è una tessera.
 * `elsewhere`: true se il QR è una tessera di un altro negozio (per E_QR_OTHER_SHOP).
 */
export async function lookupPrepaid(
  shop: Shop,
  code: string,
  actor: ActorFields,
): Promise<{ view: PrepaidView | null; elsewhere: boolean }> {
  const isQr = /^[0-9a-f]{32}$/.test(code);
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("prepaid_cards")
    .select(PREPAID_CARD_COLS)
    .eq("shop_id", shop.id)
    .eq(isQr ? "qr_token" : "short_code", isQr ? code : code.toUpperCase())
    .is("deleted_at", null)
    .maybeSingle<PrepaidCard>();
  if (error) throw error;
  if (!data) {
    if (!isQr) return { view: null, elsewhere: false };
    const other = await db
      .from("prepaid_cards")
      .select("id")
      .eq("qr_token", code)
      .neq("shop_id", shop.id)
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle();
    if (other.error) throw other.error;
    return { view: null, elsewhere: other.data !== null };
  }
  const [product, name] = await Promise.all([getProduct(shop.id, data.product_id), personName(data.customer_id)]);
  setContext({ customer_ref: data.short_code });
  const view = prepaidView(data, product, name);
  log.event("prepaid.lookup.ok", {
    ...actor,
    method: isQr ? "QR" : "codice breve",
    ...cardFields(data, product, shop),
    prepaid_state: STATE_LABEL[view.state],
    balance: data.balance,
  });
  return { view, elsewhere: false };
}

/* ------------------------------------------------------------------ */
/* Operazioni in cassa                                                 */
/* ------------------------------------------------------------------ */

interface PrepaidResult {
  card_id: string;
  short_code: string;
  status: "pending" | "active";
  balance: number;
  charged_units: number;
  activated_at: string | null;
  expires_at: string | null;
  balance_before: number;
  quantity: number;
  staff_name: string;
  staff_role: string;
  duplicate: boolean;
}

export interface PrepaidActionOptions {
  idempotencyKey?: string | null;
}

async function prepaidAction(
  action: "activate" | "consume" | "recharge" | "undo",
  cardId: string,
  staffUserId: string,
  quantity: number | null,
  opts: PrepaidActionOptions,
): Promise<PrepaidResult> {
  return callDomain<PrepaidResult>("prepaid_action", {
    p_action: action,
    p_card_id: cardId,
    p_quantity: quantity,
    p_meta: {
      ...domainMeta({ type: "staff", userId: staffUserId }),
      idempotency_key: opts.idempotencyKey ?? null,
    },
  });
}

/** Tessera aggiornata dopo un'operazione (vista per l'app). */
function after(card: PrepaidCard, product: PrepaidProduct, name: string, r: PrepaidResult): PrepaidView {
  const updated: PrepaidCard = {
    ...card,
    status: r.status,
    balance: r.balance,
    charged_units: r.charged_units,
    activated_at: r.activated_at,
    expires_at: r.expires_at,
  };
  return prepaidView(updated, product, name);
}

const iso = (v: string | null) => (v ? new Date(v).toISOString() : null);

/** Attivazione o ricarica dopo il pagamento in negozio (fuori dall'app). */
async function charge(
  kind: "activate" | "recharge",
  shop: Shop,
  cardId: string,
  staffUserId: string,
  opts: PrepaidActionOptions,
) {
  const { card, product, name } = await getPrepaid(shop.id, cardId);
  const r = await prepaidAction(kind, card.id, staffUserId, null, opts);
  if (!r.duplicate) {
    log.event(kind === "activate" ? "prepaid.activate.ok" : "prepaid.recharge.ok", {
      ...actorFields(r),
      ...cardFields(card, product, shop),
      quantity: r.quantity,
      balance_before: r.balance_before,
      balance_after: r.balance,
      expires_at: iso(r.expires_at),
    });
    await notifyPrepaidChanged(card.id);
  }
  return { prepaid: after(card, product, name, r), duplicate: r.duplicate };
}

export const activatePrepaid = (shop: Shop, cardId: string, staffUserId: string, opts: PrepaidActionOptions = {}) =>
  charge("activate", shop, cardId, staffUserId, opts);
export const rechargePrepaid = (shop: Shop, cardId: string, staffUserId: string, opts: PrepaidActionOptions = {}) =>
  charge("recharge", shop, cardId, staffUserId, opts);

const CONSUME_REJECTED = {
  E_PREPAID_NOT_ACTIVE: "prepaid.consume.rejected_inactive",
  E_PREPAID_EXPIRED: "prepaid.consume.rejected_expired",
  E_PREPAID_INSUFFICIENT: "prepaid.consume.rejected_insufficient",
} as const;

/** Scala `quantity` unità: mai prima dell'attivazione, dopo la scadenza o sotto zero. */
export async function consumePrepaid(
  shop: Shop,
  cardId: string,
  quantity: number,
  staffUserId: string,
  opts: PrepaidActionOptions = {},
) {
  const { card, product, name } = await getPrepaid(shop.id, cardId);
  const r = await prepaidAction("consume", card.id, staffUserId, quantity, opts).catch((e: unknown) =>
    onRejected(e, Object.keys(CONSUME_REJECTED) as Array<keyof typeof CONSUME_REJECTED>, (err) =>
      log.event(CONSUME_REJECTED[err.code as keyof typeof CONSUME_REJECTED], {
        ...actorFields(err.context),
        ...cardFields(card, product, shop),
        error_code: err.code,
        quantity,
        balance: card.balance,
        expires_at: iso(card.expires_at),
      }),
    ),
  );
  if (!r.duplicate) {
    log.event("prepaid.consume.ok", {
      ...actorFields(r),
      ...cardFields(card, product, shop),
      quantity: r.quantity,
      balance_before: r.balance_before,
      balance_after: r.balance,
    });
    await notifyPrepaidChanged(card.id);
  }
  return { prepaid: after(card, product, name, r), duplicate: r.duplicate };
}

/** Annulla l'ultimo scalo (entro 5 minuti, solo chi l'ha fatto, solo se è l'ultima operazione). */
export async function undoPrepaid(shop: Shop, cardId: string, staffUserId: string, opts: PrepaidActionOptions = {}) {
  const { card, product, name } = await getPrepaid(shop.id, cardId);
  const r = await prepaidAction("undo", card.id, staffUserId, null, opts);
  if (!r.duplicate) {
    log.event("prepaid.undo.ok", {
      ...actorFields(r),
      ...cardFields(card, product, shop),
      quantity: r.quantity,
      balance_after: r.balance,
    });
    await notifyPrepaidChanged(card.id);
  }
  return { prepaid: after(card, product, name, r), duplicate: r.duplicate };
}

/** Correzione del saldo (solo titolare, con motivo). */
export async function adjustPrepaid(shop: Shop, cardId: string, balance: number, reason: string, staffUserId: string) {
  const { card, product, name } = await getPrepaid(shop.id, cardId);
  const r = await callDomain<PrepaidResult>("prepaid_adjust", {
    p_card_id: card.id,
    p_balance: balance,
    p_reason: reason,
    p_meta: domainMeta({ type: "staff", userId: staffUserId }),
  });
  log.event("prepaid.adjust.ok", {
    ...actorFields(r),
    ...cardFields(card, product, shop),
    balance_before: r.balance_before,
    balance_after: r.balance,
    reason: reason.trim(),
  });
  await notifyPrepaidChanged(card.id);
  return { prepaid: after(card, product, name, { ...r, duplicate: false }), duplicate: false };
}

/* ------------------------------------------------------------------ */
/* Tipi di tessera (titolare)                                          */
/* ------------------------------------------------------------------ */

export interface ProductInput {
  name?: string | undefined;
  units?: number | undefined;
  unitSingular?: string | undefined;
  unitPlural?: string | undefined;
  validityMonths?: number | null | undefined;
  active?: boolean | undefined;
}

/** "Tessera fotocopie" → "tessera-fotocopie" (indirizzo /<negozio>/t/<code>). */
export function productCode(name: string): string {
  const base = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 26)
    .replace(/-+$/g, "");
  return base.length >= 2 ? base : "tessera";
}

async function productRows(shopId: string) {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("prepaid_products")
    .select(PREPAID_PRODUCT_COLS)
    .eq("shop_id", shopId)
    .order("created_at");
  if (error) throw error;
  const products = (data ?? []) as PrepaidProduct[];
  const { data: cards, error: e2 } = await db
    .from("prepaid_cards")
    .select("product_id, status")
    .eq("shop_id", shopId)
    .is("deleted_at", null);
  if (e2) throw e2;
  return products.map((p) => {
    const mine = (cards ?? []).filter((c) => c.product_id === p.id);
    return {
      id: p.id,
      code: p.code,
      name: p.name,
      units: p.units,
      unitSingular: p.unit_singular,
      unitPlural: p.unit_plural,
      validityMonths: p.validity_months,
      active: p.active,
      cards: {
        pending: mine.filter((c) => c.status === "pending").length,
        active: mine.filter((c) => c.status === "active").length,
      },
    };
  });
}

export const listProducts = (shop: Shop) => productRows(shop.id);

export interface NewProductInput {
  name: string;
  units: number;
  unitSingular: string;
  unitPlural: string;
  validityMonths: number | null;
}

export async function createProduct(shop: Shop, input: NewProductInput, staffUserId: string) {
  const existing = new Set((await productRows(shop.id)).map((p) => p.code));
  const base = productCode(input.name);
  let code = base;
  for (let i = 2; existing.has(code); i++) code = `${base}-${i}`;
  const r = await callDomain<PrepaidProduct & { staff_name: string; staff_role: string }>("prepaid_product_save", {
    p_shop_id: shop.id,
    p_product_id: null,
    p_fields: {
      code,
      name: input.name,
      units: input.units,
      unit_singular: input.unitSingular,
      unit_plural: input.unitPlural,
      validity_months: input.validityMonths,
      active: true,
    },
    p_meta: domainMeta({ type: "staff", userId: staffUserId }),
  });
  log.event("prepaid.product.created", {
    ...actorFields(r),
    shop_name: shop.name,
    product_name: r.name,
    units: r.units,
    unit_plural: r.unit_plural,
    validity_months: r.validity_months,
  });
  await notifyPrepaidProductChanged(r.id);
  return (await productRows(shop.id)).find((p) => p.id === r.id)!;
}

const LABELS: Array<[keyof PrepaidProduct, string, (v: unknown) => string]> = [
  ["name", "nome", (v) => String(v)],
  ["units", "unità", (v) => String(v)],
  ["unit_singular", "unità al singolare", (v) => String(v)],
  ["unit_plural", "unità al plurale", (v) => String(v)],
  ["validity_months", "scadenza", (v) => (v === null ? "nessuna" : `${String(v)} mesi`)],
  ["active", "disponibile", (v) => (v ? "sì" : "no")],
];

export async function updateProduct(shop: Shop, productId: string, input: ProductInput, staffUserId: string) {
  await getProduct(shop.id, productId);
  const fields: Record<string, unknown> = {};
  if (input.name !== undefined) fields.name = input.name;
  if (input.units !== undefined) fields.units = input.units;
  if (input.unitSingular !== undefined) fields.unit_singular = input.unitSingular;
  if (input.unitPlural !== undefined) fields.unit_plural = input.unitPlural;
  if (input.validityMonths !== undefined) fields.validity_months = input.validityMonths;
  if (input.active !== undefined) fields.active = input.active;
  const r = await callDomain<
    PrepaidProduct & { staff_name: string; staff_role: string; card_changed: boolean; before: PrepaidProduct }
  >("prepaid_product_save", {
    p_shop_id: shop.id,
    p_product_id: productId,
    p_fields: fields,
    p_meta: domainMeta({ type: "staff", userId: staffUserId }),
  });
  const changes = LABELS.filter(([k]) => r.before[k] !== r[k]).map(
    ([k, label, fmt]) => `${label} ${fmt(r.before[k])} → ${fmt(r[k])}`,
  );
  if (changes.length > 0) {
    log.event("prepaid.product.updated", {
      ...actorFields(r),
      shop_name: shop.name,
      product_name: r.name,
      changes: changes.join(", "),
    });
  }
  if (r.card_changed) await notifyPrepaidProductChanged(r.id);
  return (await productRows(shop.id)).find((p) => p.id === r.id)!;
}

export { prepaidState };
