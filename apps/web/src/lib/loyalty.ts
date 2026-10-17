import "server-only";
import type { CardView, PrepaidView } from "@loyalty/shared/api";
import { AppError, type ErrorCode } from "@loyalty/shared/errors";
import type { ActorFields, ActorRole, CardFields } from "@loyalty/shared/logging/events";
import { getContext, setContext } from "./observability/context";
import { log } from "./observability/logger";
import { callDomain, domainMeta, type DomainActor } from "./merchant/domain-call";
import { lookupPrepaid } from "./prepaid";
import { supabaseAdmin } from "./supabase";
import { CUSTOMER_COLS, SHOP_COLS } from "./db-columns";
import type { Customer, Shop } from "./types";
import { googleEnabled } from "./wallet/google/config";
import { saveUrl } from "./wallet/google/payload";
import { notifyCardChanged } from "./wallet/notifier";

export type { DomainActor };

/*
 * Dominio: iscrizione, timbri, premi, dati dei clienti.
 * Ogni modifica passa da una funzione Postgres atomica che scrive anche audit_log
 * (supabase/migrations/*_funzioni_dominio.sql); qui si risolvono le carte, si
 * scrivono gli eventi di log e si avvisano i wallet.
 */

const staffActor = (userId: string): DomainActor => ({ type: "staff", userId });

/** Risultato comune delle funzioni di dominio (vedi _card_json e _staff_json). */
interface CardResult {
  customer_id: string;
  short_code: string;
  stamps: number;
  rewards_available: number;
  stamps_required: number;
  staff_name: string;
  staff_role: ActorRole;
}

/** Campi "chi ha agito" per i log, dai dati restituiti dal database. */
export function actorFields(src: { staff_name?: unknown; staff_role?: unknown }): ActorFields {
  const ctx = getContext() ?? {};
  return {
    actor_name: typeof src.staff_name === "string" ? src.staff_name : "sconosciuto",
    actor_role: (src.staff_role as ActorRole | undefined) ?? "operator",
    platform: ctx.platform ?? "sconosciuta",
    app_version: ctx.app_version ?? "n/d",
  };
}

const cardFields = (customer: Customer, shop: Shop): CardFields => ({
  customer_ref: customer.short_code,
  shop_name: shop.name,
});

/**
 * Se l'errore è uno dei codici attesi, scrive l'evento di rifiuto e marca l'errore come
 * già registrato (withApi non lo ripete a livello warn). Poi lo rilancia sempre.
 */
export function onRejected(e: unknown, codes: readonly ErrorCode[], write: (err: AppError) => void): never {
  if (e instanceof AppError && codes.includes(e.code)) {
    write(e);
    e.logged = true;
  }
  throw e;
}

/** Opzioni delle azioni sul saldo chiamate dall'app (header Idempotency-Key). */
export interface ActionOptions {
  idempotencyKey?: string | null;
}

type ActionResult<T> = T & { duplicate: boolean; original_at?: string };

/**
 * Azione sul saldo tramite card_action: con una chiave di idempotenza già usata il database
 * restituisce la risposta salvata (duplicate: true) senza toccare il saldo.
 */
async function cardAction<T>(
  action: "stamp" | "undo" | "redeem",
  customerId: string,
  staffUserId: string,
  opts: ActionOptions & { force?: boolean },
): Promise<ActionResult<T>> {
  return callDomain<ActionResult<T>>("card_action", {
    p_action: action,
    p_customer_id: customerId,
    p_meta: { ...domainMeta(staffActor(staffUserId)), idempotency_key: opts.idempotencyKey ?? null },
    p_force: opts.force === true,
  });
}

const DUPLICATE_EVENT = {
  stamp: "stamp.add.duplicate_ignored",
  undo: "stamp.undo.duplicate_ignored",
  redeem: "reward.redeem.duplicate_ignored",
} as const;

function logDuplicate(
  action: keyof typeof DUPLICATE_EVENT,
  r: ActionResult<CardResult>,
  customer: Customer,
  shop: Shop,
) {
  const original = r.original_at ?? new Date().toISOString();
  log.event(DUPLICATE_EVENT[action], {
    ...actorFields(r),
    ...cardFields(customer, shop),
    original_at: new Date(original).toISOString(),
    seconds_since: Math.max(0, Math.round((Date.now() - new Date(original).getTime()) / 1000)),
  });
}

/* ------------------------------------------------------------------ */
/* Lettura                                                             */
/* ------------------------------------------------------------------ */

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

function ensureUsable(customer: Customer): Customer {
  setContext({ customer_ref: customer.short_code });
  if (customer.deleted_at) {
    throw new AppError(
      "E_CARD_DELETED",
      `la carta ${customer.short_code} è stata cancellata il ${customer.deleted_at}`,
    );
  }
  return customer;
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
  return ensureUsable(data as Customer);
}

/** Carta per id, solo se appartiene al negozio indicato. */
export async function getCustomerById(shopId: string, customerId: string): Promise<Customer> {
  const { data, error } = await supabaseAdmin()
    .from("customers")
    .select(CUSTOMER_COLS)
    .eq("shop_id", shopId)
    .eq("id", customerId)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    throw new AppError("E_CARD_NOT_FOUND", `nessuna carta ${customerId} nel negozio ${shopId}`, { shop_id: shopId });
  }
  return ensureUsable(data as Customer);
}

/** Carta come la vede lo staff (contratto CardView): niente telefono, niente QR. */
export function cardView(c: Customer, shop: Shop): CardView {
  return {
    id: c.id,
    shortCode: c.short_code,
    name: c.name,
    stamps: c.stamps,
    stampsRequired: shop.stamps_required,
    rewardsAvailable: c.rewards_available,
    rewardLabel: shop.reward_label,
  };
}

/**
 * Trova la carta scansionata (QR) o digitata (codice breve) nel negozio dello staff.
 * Un QR valido di un altro negozio dà E_QR_OTHER_SHOP, senza dire di quale negozio.
 */
export async function lookupCard(
  shop: Shop,
  code: string,
  actor: ActorFields,
): Promise<
  { kind: "fedelta"; card: CardView; since: string; visits: number } | { kind: "tessera"; prepaid: PrepaidView }
> {
  const isQr = /^[0-9a-f]{32}$/.test(code);
  const method = isQr ? "QR" : "codice breve";
  const { data, error } = await supabaseAdmin()
    .from("customers")
    .select(CUSTOMER_COLS)
    .eq("shop_id", shop.id)
    .eq(isQr ? "qr_token" : "short_code", isQr ? code : code.toUpperCase())
    .maybeSingle();
  if (error) throw error;

  if (!data) {
    // non è una carta fedeltà: può essere una tessera prepagata (Fase 9.5)
    const prepaid = await lookupPrepaid(shop, code, actor);
    if (prepaid.view) return { kind: "tessera", prepaid: prepaid.view };
    const other = isQr
      ? await supabaseAdmin().from("customers").select("id").eq("qr_token", code).limit(1).maybeSingle()
      : { data: null, error: null };
    if (other.error) throw other.error;
    const elsewhere = other.data !== null || prepaid.elsewhere;
    log.event(elsewhere ? "customer.lookup.other_shop" : "customer.lookup.not_found", {
      ...actor,
      shop_name: shop.name,
      method,
    });
    const err = elsewhere
      ? new AppError(
          "E_QR_OTHER_SHOP",
          `il QR scansionato è una carta di un altro negozio (negozio attuale ${shop.id})`,
        )
      : new AppError(
          "E_CARD_NOT_FOUND",
          `nessuna carta del negozio ${shop.id} con ${method === "QR" ? "il QR" : "il codice breve"} indicato`,
        );
    err.logged = true;
    throw err;
  }

  const customer = ensureUsable(data as Customer);
  log.event("customer.lookup.ok", {
    ...actor,
    shop_name: shop.name,
    method,
    customer_ref: customer.short_code,
    stamps: customer.stamps,
    stamps_required: shop.stamps_required,
    rewards_available: customer.rewards_available,
  });
  // "Cliente da marzo · 17 visite": iscrizione e timbri ricevuti in tutto (non annullati)
  const [{ data: since, error: e1 }, { count, error: e2 }] = await Promise.all([
    supabaseAdmin().from("customers").select("created_at").eq("id", customer.id).single(),
    supabaseAdmin()
      .from("stamp_events")
      .select("id", { count: "exact", head: true })
      .eq("customer_id", customer.id)
      .eq("kind", "stamp")
      .is("undone_at", null),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;
  return { kind: "fedelta", card: cardView(customer, shop), since: String(since.created_at), visits: count ?? 0 };
}

/* ------------------------------------------------------------------ */
/* Iscrizione                                                          */
/* ------------------------------------------------------------------ */

export interface EnrollInput {
  shopSlug: string;
  name: string;
  phone: string;
  consentPrivacy: boolean;
  consentMarketing: boolean;
}

/**
 * Iscrive il cliente (o ritrova quello attivo con lo stesso telefono),
 * crea la carta su Google e restituisce il link "Salva in Wallet".
 */
export async function enroll(input: EnrollInput & { shop?: Shop }) {
  const shop = input.shop ?? (await getShopBySlug(input.shopSlug));
  if (!shop) throw new AppError("E_SHOP_NOT_FOUND", `nessun negozio con slug "${input.shopSlug}"`);
  setContext({ shop_id: shop.id });

  const result = await callDomain<CardResult & { returning: boolean }>("enroll_customer", {
    p_shop_id: shop.id,
    p_name: input.name,
    p_phone: input.phone,
    p_consent_privacy: input.consentPrivacy,
    p_consent_marketing: input.consentMarketing,
    p_meta: domainMeta({ type: "customer", customerId: "" }),
  });
  const customer = await getCustomerById(shop.id, result.customer_id);

  if (result.returning) {
    log.event("enroll.customer.returning", {
      ...cardFields(customer, shop),
      stamps: customer.stamps,
      stamps_required: shop.stamps_required,
      rewards_available: customer.rewards_available,
    });
  } else {
    log.event("enroll.customer.created", {
      ...cardFields(customer, shop),
      platform: getContext()?.platform ?? "sconosciuta",
      consent_marketing: input.consentMarketing,
    });
  }

  // chi torna e spunta "avvisami di offerte" dà un consenso esplicito: lo si registra (mai il contrario)
  if (result.returning && input.consentMarketing) {
    const { data } = await supabaseAdmin().from("customers").select("consent_marketing").eq("id", customer.id).single();
    if (data && !data.consent_marketing) {
      await setMarketingConsent(shop.id, customer.id, true, { type: "customer", customerId: customer.id });
    }
  }

  // la carta su Google si crea dopo la risposta; il link contiene comunque la carta completa
  await notifyCardChanged(shop, customer.id, { kind: "enroll" });
  return {
    shop,
    customer,
    returning: result.returning,
    googleSaveUrl: googleEnabled() ? saveUrl(shop, customer) : null,
  };
}

/* ------------------------------------------------------------------ */
/* Timbri e premi (staff)                                              */
/* ------------------------------------------------------------------ */

export async function addStamp(
  shopId: string,
  customerId: string,
  staffUserId: string,
  opts: ActionOptions & { force?: boolean } = {},
) {
  const [customer, shop] = await Promise.all([getCustomerById(shopId, customerId), getShopById(shopId)]);

  const r = await cardAction<
    CardResult & {
      stamps_before: number;
      reward_unlocked: boolean;
      stamp_event_id: number;
      forced?: boolean;
      cooldown_minutes_left?: number | null;
      cooldown_min?: number;
      last_stamp_at?: string | null;
    }
  >("stamp", customer.id, staffUserId, opts).catch((e: unknown) =>
    onRejected(e, ["E_STAMP_COOLDOWN"], (err) =>
      log.event("stamp.add.rejected_cooldown", {
        ...actorFields(err.context),
        ...cardFields(customer, shop),
        error_code: err.code,
        last_stamp_at: new Date(String(err.context.last_stamp_at)).toISOString(),
        minutes_since: Number(err.context.minutes_since),
        cooldown_min: Number(err.context.cooldown_min),
        minutes_left: Number(err.context.minutes_left),
      }),
    ),
  );
  const updated: Customer = { ...customer, stamps: r.stamps, rewards_available: r.rewards_available };
  const forced = r.forced === true;

  if (r.duplicate) {
    // stessa chiave di un tocco già eseguito: stessa risposta, niente secondo timbro né nuovo avviso al wallet
    logDuplicate("stamp", r, customer, shop);
    return { customer: cardView(updated, shop), rewardUnlocked: r.reward_unlocked, forced };
  }

  log.event("stamp.add.ok", {
    ...actorFields(r),
    ...cardFields(customer, shop),
    stamps_before: r.stamps_before,
    stamps_after: r.stamps,
    stamps_required: r.stamps_required,
    rewards_after: r.rewards_available,
    reward_unlocked: r.reward_unlocked,
  });
  if (forced) {
    log.event("stamp.add.forced", {
      ...actorFields(r),
      ...cardFields(customer, shop),
      stamps_before: r.stamps_before,
      stamps_after: r.stamps,
      stamps_required: r.stamps_required,
      cooldown_min: Number(r.cooldown_min ?? 0),
      minutes_left: Number(r.cooldown_minutes_left ?? 0),
      last_stamp_at: new Date(String(r.last_stamp_at)).toISOString(),
    });
  }
  if (r.reward_unlocked) {
    log.event("reward.unlocked", {
      ...cardFields(customer, shop),
      stamps_required: r.stamps_required,
      reward_label: shop.reward_label,
      rewards_available: r.rewards_available,
    });
  }

  await notifyCardChanged(shop, customer.id, {
    kind: "stamp",
    rewardUnlockedBy: r.reward_unlocked ? r.stamp_event_id : undefined,
  });
  return { customer: cardView(updated, shop), rewardUnlocked: r.reward_unlocked, forced };
}

const UNDO_REJECTIONS = [
  "E_UNDO_EXPIRED",
  "E_UNDO_OTHER_OPERATOR",
  "E_UNDO_NOT_LAST",
  "E_UNDO_REWARD_REDEEMED",
  "E_NOTHING_TO_UNDO",
] as const satisfies readonly ErrorCode[];

/** Annulla l'ultimo timbro della carta (entro 5 minuti, solo chi l'ha dato, solo se è l'ultima operazione). */
export async function undoLastStamp(shopId: string, customerId: string, staffUserId: string, opts: ActionOptions = {}) {
  const [customer, shop] = await Promise.all([getCustomerById(shopId, customerId), getShopById(shopId)]);

  const r = await cardAction<CardResult & { stamps_before: number; rewards_before: number; reward_removed: boolean }>(
    "undo",
    customer.id,
    staffUserId,
    opts,
  ).catch((e: unknown) =>
    onRejected(e, UNDO_REJECTIONS, (err) =>
      log.event("stamp.undo.rejected", {
        ...actorFields(err.context),
        ...cardFields(customer, shop),
        error_code: err.code,
        rejection_reason: err.message,
      }),
    ),
  );

  const undone: Customer = { ...customer, stamps: r.stamps, rewards_available: r.rewards_available };
  if (r.duplicate) {
    logDuplicate("undo", r, customer, shop);
    return { customer: cardView(undone, shop) };
  }

  log.event("stamp.undo.ok", {
    ...actorFields(r),
    ...cardFields(customer, shop),
    stamps_before: r.stamps_before,
    stamps_after: r.stamps,
    rewards_before: r.rewards_before,
    rewards_after: r.rewards_available,
    stamps_required: r.stamps_required,
    reward_removed: r.reward_removed,
  });

  const updated: Customer = { ...customer, stamps: r.stamps, rewards_available: r.rewards_available };
  await notifyCardChanged(shop, customer.id, { kind: "undo" });
  return { customer: cardView(updated, shop) };
}

export async function redeem(shopId: string, customerId: string, staffUserId: string, opts: ActionOptions = {}) {
  const [customer, shop] = await Promise.all([getCustomerById(shopId, customerId), getShopById(shopId)]);

  const r = await cardAction<CardResult & { rewards_before: number }>("redeem", customer.id, staffUserId, opts).catch(
    (e: unknown) =>
      onRejected(e, ["E_NO_REWARD"], (err) =>
        log.event("reward.redeem.rejected_none", {
          ...actorFields(err.context),
          ...cardFields(customer, shop),
          error_code: err.code,
          stamps: customer.stamps,
          stamps_required: shop.stamps_required,
        }),
      ),
  );

  const redeemed: Customer = { ...customer, stamps: r.stamps, rewards_available: r.rewards_available };
  if (r.duplicate) {
    logDuplicate("redeem", r, customer, shop);
    return { customer: cardView(redeemed, shop) };
  }

  log.event("reward.redeem.ok", {
    ...actorFields(r),
    ...cardFields(customer, shop),
    reward_label: shop.reward_label,
    rewards_before: r.rewards_before,
    rewards_after: r.rewards_available,
  });

  const updated: Customer = { ...customer, stamps: r.stamps, rewards_available: r.rewards_available };
  await notifyCardChanged(shop, customer.id, { kind: "redeem" });
  return { customer: cardView(updated, shop) };
}

/* ------------------------------------------------------------------ */
/* Gestione del cliente (titolare, assistenza, cliente)                */
/* ------------------------------------------------------------------ */

/** Rettifica a valori assoluti di timbri e premi: solo titolare, motivo obbligatorio. */
export async function adjustBalance(
  shopId: string,
  customerId: string,
  input: { stamps: number; rewards: number; reason: string },
  staffUserId: string,
) {
  const [customer, shop] = await Promise.all([getCustomerById(shopId, customerId), getShopById(shopId)]);
  const r = await callDomain<CardResult & { stamps_before: number; rewards_before: number }>("adjust_balance", {
    p_customer_id: customer.id,
    p_stamps: input.stamps,
    p_rewards: input.rewards,
    p_reason: input.reason,
    p_meta: domainMeta(staffActor(staffUserId)),
  });

  log.event("balance.adjust.ok", {
    ...actorFields(r),
    ...cardFields(customer, shop),
    stamps_before: r.stamps_before,
    stamps_after: r.stamps,
    rewards_before: r.rewards_before,
    rewards_after: r.rewards_available,
    stamps_required: r.stamps_required,
    reason: input.reason.trim(),
  });

  const updated: Customer = { ...customer, stamps: r.stamps, rewards_available: r.rewards_available };
  await notifyCardChanged(shop, customer.id, { kind: "adjust" });
  return { customer: cardView(updated, shop) };
}

/**
 * Cancella i dati personali del cliente (titolare dall'app o assistenza dal pannello, su richiesta GDPR):
 * nome, telefono e consensi rimossi, storico di audit pseudonimizzato, carta disattivata su Google.
 */
export async function deleteCustomer(shopId: string, customerId: string, actor: DomainActor, reason?: string) {
  const [customer, shop] = await Promise.all([getCustomerById(shopId, customerId), getShopById(shopId)]);
  const r = await callDomain<CardResult & { audit_rows_pseudonymized: number }>("delete_customer", {
    p_customer_id: customer.id,
    p_reason: reason ?? null,
    p_meta: domainMeta(actor),
  });

  if (actor.type === "support") {
    log.event("support.customer.delete", {
      support_name: actor.name,
      ...cardFields(customer, shop),
      reason: reason?.trim() || "non indicato",
      stamps_at_delete: customer.stamps,
      rewards_at_delete: customer.rewards_available,
      audit_rows_pseudonymized: r.audit_rows_pseudonymized,
    });
  } else {
    log.event("customer.delete.ok", {
      ...actorFields(r),
      ...cardFields(customer, shop),
      stamps_at_delete: customer.stamps,
      rewards_at_delete: customer.rewards_available,
      audit_rows_pseudonymized: r.audit_rows_pseudonymized,
    });
  }
  await notifyCardChanged(shop, customer.id, { kind: "delete" });
  return { deleted: true as const, shortCode: customer.short_code };
}

/** Consenso alle promozioni: dal titolare o dal cliente stesso (link di disiscrizione). */
export async function setMarketingConsent(shopId: string, customerId: string, consent: boolean, actor: DomainActor) {
  const [customer, shop] = await Promise.all([getCustomerById(shopId, customerId), getShopById(shopId)]);
  const r = await callDomain<CardResult & { changed: boolean }>("set_marketing_consent", {
    p_customer_id: customer.id,
    p_consent: consent,
    p_meta: domainMeta(actor),
  });

  if (r.changed) {
    log.event("customer.marketing.changed", {
      ...actorFields(r),
      ...cardFields(customer, shop),
      consent_marketing: consent,
    });
  }
  return { changed: r.changed, consentMarketing: consent };
}
