import "server-only";
import type { PointsView } from "@loyalty/shared/api";
import { levelFor } from "@loyalty/shared/copy";
import type { ActorFields } from "@loyalty/shared/logging/events";
import { actorFields, getCustomerById } from "./loyalty";
import { callDomain, domainMeta } from "./merchant/domain-call";
import { log } from "./observability/logger";
import { supabaseAdmin } from "./supabase";
import type { Customer, Shop } from "./types";
import { notifyCardChanged } from "./wallet/notifier";

/*
 * Carta a punti con livelli (Fase 9.6): punti per euro speso, livello sui punti totali (che non si
 * perdono). Ogni modifica passa dalle funzioni Postgres (points_action, adjust_points), che scrivono
 * audit_log; qui si scrivono gli eventi di log e si avvisa il wallet.
 */

/** Carta a punti come la vede lo staff (contratto PointsView): niente telefono, niente QR. */
export function pointsView(c: Pick<Customer, "id" | "short_code" | "name" | "points" | "points_total">, shop: Shop) {
  const { current, next, toNext } = levelFor(shop.points_levels, c.points_total);
  return {
    id: c.id,
    shortCode: c.short_code,
    name: c.name,
    points: c.points,
    pointsTotal: c.points_total,
    level: current.name,
    perk: current.perk,
    nextLevel: next?.name ?? null,
    toNext,
    pointsPerEuro: shop.points_per_euro,
    minCents: shop.points_min_cents,
  } satisfies PointsView;
}

const cardFields = (c: Pick<Customer, "short_code">, shop: Shop) => ({
  customer_ref: c.short_code,
  shop_name: shop.name,
});

/** Scansione di una carta a punti (dopo che lookupCard l'ha trovata). */
export async function lookupPoints(customer: Customer, shop: Shop, actor: ActorFields, method: string) {
  const view = pointsView(customer, shop);
  log.event("points.lookup.ok", {
    ...actor,
    shop_name: shop.name,
    method,
    customer_ref: customer.short_code,
    points: customer.points,
    level: view.level,
  });
  const { data, error } = await supabaseAdmin().from("customers").select("created_at").eq("id", customer.id).single();
  if (error) throw error;
  return { kind: "punti" as const, card: view, since: String(data.created_at) };
}

interface PointsResult {
  customer_id: string;
  short_code: string;
  points: number;
  points_total: number;
  level: string;
  points_added?: number;
  points_removed?: number;
  amount_cents?: number;
  level_before?: string;
  level_after?: string;
  level_changed?: boolean;
  points_event_id?: number;
  points_before?: number;
  staff_name: string;
  staff_role: string;
  duplicate?: boolean;
  original_at?: string;
}

export interface PointsActionOptions {
  idempotencyKey?: string | null;
}

const after = (c: Customer, shop: Shop, r: PointsResult) =>
  pointsView({ ...c, points: r.points, points_total: r.points_total }, shop);

/** Livello cambiato: evento e notifica sulla carta nel wallet (solo salendo). */
function levelChange(shop: Shop, c: Customer, r: PointsResult, eventId: number | undefined) {
  if (!r.level_before || !r.level_after || r.level_before === r.level_after) return undefined;
  const perk = shop.points_levels.find((l) => l.name === r.level_after)?.perk ?? "";
  log.event("points.level.changed", {
    ...cardFields(c, shop),
    level_before: r.level_before,
    level_after: r.level_after,
    perk,
    points_total: r.points_total,
  });
  const up =
    (shop.points_levels.find((l) => l.name === r.level_after)?.min ?? 0) >
    (shop.points_levels.find((l) => l.name === r.level_before)?.min ?? 0);
  return up && eventId !== undefined ? { eventId, level: r.level_after, perk } : undefined;
}

/** Punti per l'importo dello scontrino (in centesimi), arrotondati per difetto. */
export async function addPoints(
  shop: Shop,
  customerId: string,
  amountCents: number,
  staffUserId: string,
  opts: PointsActionOptions = {},
) {
  const c = await getCustomerById(shop.id, customerId);
  const r = await callDomain<PointsResult>("points_action", {
    p_action: "add",
    p_customer_id: c.id,
    p_amount_cents: amountCents,
    p_meta: { ...domainMeta({ type: "staff", userId: staffUserId }), idempotency_key: opts.idempotencyKey ?? null },
  });
  if (r.duplicate) {
    const original = r.original_at ?? new Date().toISOString();
    log.event("points.add.duplicate_ignored", {
      ...actorFields(r),
      ...cardFields(c, shop),
      original_at: new Date(original).toISOString(),
      seconds_since: Math.max(0, Math.round((Date.now() - new Date(original).getTime()) / 1000)),
    });
    return { card: after(c, shop, r), pointsAdded: r.points_added ?? 0, levelChanged: false, duplicate: true };
  }
  log.event("points.add.ok", {
    ...actorFields(r),
    ...cardFields(c, shop),
    amount_cents: amountCents,
    points_added: r.points_added ?? 0,
    points_before: r.points - (r.points_added ?? 0),
    points_after: r.points,
    level: r.level,
  });
  const levelUp = levelChange(shop, c, r, r.points_event_id);
  await notifyCardChanged(shop, c.id, { kind: "points", levelUp });
  return {
    card: after(c, shop, r),
    pointsAdded: r.points_added ?? 0,
    levelChanged: r.level_changed === true,
    duplicate: false,
  };
}

/** Annulla gli ultimi punti dati (entro 5 minuti, solo chi li ha dati, solo se è l'ultima operazione). */
export async function undoPoints(shop: Shop, customerId: string, staffUserId: string, opts: PointsActionOptions = {}) {
  const c = await getCustomerById(shop.id, customerId);
  const r = await callDomain<PointsResult>("points_action", {
    p_action: "undo",
    p_customer_id: c.id,
    p_amount_cents: null,
    p_meta: { ...domainMeta({ type: "staff", userId: staffUserId }), idempotency_key: opts.idempotencyKey ?? null },
  });
  if (!r.duplicate) {
    log.event("points.undo.ok", {
      ...actorFields(r),
      ...cardFields(c, shop),
      points_removed: r.points_removed ?? 0,
      points_after: r.points,
      level: r.level,
    });
    await notifyCardChanged(shop, c.id, { kind: "undo" });
  }
  return {
    card: after(c, shop, r),
    pointsAdded: -(r.points_removed ?? 0),
    levelChanged: false,
    duplicate: r.duplicate === true,
  };
}

/** Correzione dei punti (solo titolare, con motivo): cambiano saldo e totale, quindi anche il livello. */
export async function adjustPoints(
  shop: Shop,
  customerId: string,
  points: number,
  reason: string,
  staffUserId: string,
) {
  const c = await getCustomerById(shop.id, customerId);
  const r = await callDomain<PointsResult>("adjust_points", {
    p_customer_id: c.id,
    p_points: points,
    p_reason: reason,
    p_meta: domainMeta({ type: "staff", userId: staffUserId }),
  });
  log.event("points.adjust.ok", {
    ...actorFields(r),
    ...cardFields(c, shop),
    points_before: r.points_before ?? c.points,
    points_after: r.points,
    level: r.level,
    reason: reason.trim(),
  });
  levelChange(shop, c, r, undefined);
  await notifyCardChanged(shop, c.id, { kind: "adjust" });
  return {
    card: after(c, shop, r),
    pointsAdded: r.points - (r.points_before ?? c.points),
    levelChanged: r.level_before !== undefined && r.level_before !== r.level_after,
    duplicate: false,
  };
}
