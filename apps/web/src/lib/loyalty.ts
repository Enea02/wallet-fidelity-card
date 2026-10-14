import "server-only";
import { AppError, type ErrorCode } from "@loyalty/shared/errors";
import type { ActorFields, ActorRole, CardFields } from "@loyalty/shared/logging/events";
import { fromDbError } from "./db-errors";
import { getContext, setContext } from "./observability/context";
import { log } from "./observability/logger";
import { supabaseAdmin } from "./supabase";
import type { Customer, Shop } from "./types";
import { googleEnabled, saveUrl, upsertLoyaltyObject } from "./wallet/google";
import { notifyCardChanged } from "./wallet/notifier";

/*
 * Dominio: iscrizione, timbri, premi, dati dei clienti.
 * Ogni modifica passa da una funzione Postgres atomica che scrive anche audit_log
 * (supabase/migrations/*_funzioni_dominio.sql); qui si risolvono le carte, si
 * scrivono gli eventi di log e si avvisano i wallet.
 */

const SHOP_COLS = "id, slug, name, stamps_required, reward_label, logo_url, hex_color, stamp_cooldown_minutes, status";
const CUSTOMER_COLS = "id, shop_id, name, phone, qr_token, short_code, stamps, rewards_available, deleted_at";

/** Chi esegue l'operazione. */
export type DomainActor =
  { type: "staff"; userId: string } | { type: "support"; name: string } | { type: "customer"; customerId: string };

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

/** Parametro p_meta delle funzioni Postgres: chi, da dove, con quale richiesta. */
function meta(actor: DomainActor): Record<string, unknown> {
  const ctx = getContext() ?? {};
  return {
    request_id: ctx.request_id ?? null,
    actor_type: actor.type,
    actor_id: actor.type === "staff" ? actor.userId : actor.type === "customer" ? actor.customerId : actor.name,
    platform: ctx.platform ?? null,
    app_version: ctx.app_version ?? null,
    ip_hash: ctx.ip_hash ?? null,
  };
}

async function callDomain<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabaseAdmin().rpc(fn, args);
  if (error) throw fromDbError(error);
  return data as T;
}

/** Campi "chi ha agito" per i log, dai dati restituiti dal database. */
function actorFields(src: { staff_name?: unknown; staff_role?: unknown }): ActorFields {
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
function onRejected(e: unknown, codes: readonly ErrorCode[], write: (err: AppError) => void): never {
  if (e instanceof AppError && codes.includes(e.code)) {
    write(e);
    e.logged = true;
  }
  throw e;
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

/** Cosa vede lo staff dopo la scansione (niente telefono/id interni). */
export function publicView(c: Customer, shop: Shop) {
  return {
    name: c.name,
    shortCode: c.short_code,
    stamps: c.stamps,
    stampsRequired: shop.stamps_required,
    rewardsAvailable: c.rewards_available,
    rewardLabel: shop.reward_label,
  };
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
export async function enroll(input: EnrollInput) {
  const shop = await getShopBySlug(input.shopSlug);
  if (!shop) throw new AppError("E_SHOP_NOT_FOUND", `nessun negozio con slug "${input.shopSlug}"`);
  setContext({ shop_id: shop.id });

  const result = await callDomain<CardResult & { returning: boolean }>("enroll_customer", {
    p_shop_id: shop.id,
    p_name: input.name,
    p_phone: input.phone,
    p_consent_privacy: input.consentPrivacy,
    p_consent_marketing: input.consentMarketing,
    p_meta: meta({ type: "customer", customerId: "" }),
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

  if (!googleEnabled()) return { googleSaveUrl: null };
  await upsertLoyaltyObject({ shop, customer });
  return { googleSaveUrl: saveUrl(customer.id, shop) };
}

/* ------------------------------------------------------------------ */
/* Timbri e premi (staff)                                              */
/* ------------------------------------------------------------------ */

export async function addStamp(shopId: string, qrToken: string, staffUserId: string) {
  const [customer, shop] = await Promise.all([getCustomerByQr(shopId, qrToken), getShopById(shopId)]);

  const r = await callDomain<CardResult & { stamps_before: number; reward_unlocked: boolean }>("add_stamp", {
    p_customer_id: customer.id,
    p_meta: meta(staffActor(staffUserId)),
  }).catch((e: unknown) =>
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

  log.event("stamp.add.ok", {
    ...actorFields(r),
    ...cardFields(customer, shop),
    stamps_before: r.stamps_before,
    stamps_after: r.stamps,
    stamps_required: r.stamps_required,
    rewards_after: r.rewards_available,
    reward_unlocked: r.reward_unlocked,
  });
  if (r.reward_unlocked) {
    log.event("reward.unlocked", {
      ...cardFields(customer, shop),
      stamps_required: r.stamps_required,
      reward_label: shop.reward_label,
      rewards_available: r.rewards_available,
    });
  }

  const updated: Customer = { ...customer, stamps: r.stamps, rewards_available: r.rewards_available };
  await notifyCardChanged({ shop, customer: updated }, { kind: "stamp", rewardUnlocked: r.reward_unlocked });
  return { customer: publicView(updated, shop), rewardUnlocked: r.reward_unlocked };
}

const UNDO_REJECTIONS = [
  "E_UNDO_EXPIRED",
  "E_UNDO_OTHER_OPERATOR",
  "E_UNDO_NOT_LAST",
  "E_UNDO_REWARD_REDEEMED",
  "E_NOTHING_TO_UNDO",
] as const satisfies readonly ErrorCode[];

/** Annulla l'ultimo timbro della carta (entro 5 minuti, solo chi l'ha dato, solo se è l'ultima operazione). */
export async function undoLastStamp(shopId: string, qrToken: string, staffUserId: string) {
  const [customer, shop] = await Promise.all([getCustomerByQr(shopId, qrToken), getShopById(shopId)]);

  const r = await callDomain<CardResult & { stamps_before: number; rewards_before: number; reward_removed: boolean }>(
    "undo_last_stamp",
    { p_customer_id: customer.id, p_meta: meta(staffActor(staffUserId)) },
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
  await notifyCardChanged({ shop, customer: updated }, { kind: "undo", rewardUnlocked: false });
  return { customer: publicView(updated, shop) };
}

export async function redeem(shopId: string, qrToken: string, staffUserId: string) {
  const [customer, shop] = await Promise.all([getCustomerByQr(shopId, qrToken), getShopById(shopId)]);

  const r = await callDomain<CardResult & { rewards_before: number }>("redeem_reward", {
    p_customer_id: customer.id,
    p_meta: meta(staffActor(staffUserId)),
  }).catch((e: unknown) =>
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

  log.event("reward.redeem.ok", {
    ...actorFields(r),
    ...cardFields(customer, shop),
    reward_label: shop.reward_label,
    rewards_before: r.rewards_before,
    rewards_after: r.rewards_available,
  });

  const updated: Customer = { ...customer, stamps: r.stamps, rewards_available: r.rewards_available };
  await notifyCardChanged({ shop, customer: updated }, { kind: "redeem", rewardUnlocked: false });
  return { customer: publicView(updated, shop) };
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
    p_meta: meta(staffActor(staffUserId)),
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
  await notifyCardChanged({ shop, customer: updated }, { kind: "adjust", rewardUnlocked: false });
  return { customer: publicView(updated, shop) };
}

/**
 * Cancella i dati personali del cliente (titolare o assistenza): nome, telefono e consensi
 * rimossi, storico di audit pseudonimizzato. La disattivazione della carta Google arriva in Fase 4.
 */
export async function deleteCustomer(shopId: string, customerId: string, actor: DomainActor, reason?: string) {
  const [customer, shop] = await Promise.all([getCustomerById(shopId, customerId), getShopById(shopId)]);
  const r = await callDomain<CardResult & { audit_rows_pseudonymized: number }>("delete_customer", {
    p_customer_id: customer.id,
    p_reason: reason ?? null,
    p_meta: meta(actor),
  });

  log.event("customer.delete.ok", {
    ...actorFields(r),
    ...cardFields(customer, shop),
    stamps_at_delete: customer.stamps,
    rewards_at_delete: customer.rewards_available,
    audit_rows_pseudonymized: r.audit_rows_pseudonymized,
  });
  return { deleted: true, shortCode: customer.short_code };
}

/** Consenso alle promozioni: dal titolare o dal cliente stesso (link di disiscrizione). */
export async function setMarketingConsent(shopId: string, customerId: string, consent: boolean, actor: DomainActor) {
  const [customer, shop] = await Promise.all([getCustomerById(shopId, customerId), getShopById(shopId)]);
  const r = await callDomain<CardResult & { changed: boolean }>("set_marketing_consent", {
    p_customer_id: customer.id,
    p_consent: consent,
    p_meta: meta(actor),
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
