import "server-only";
import type { Promotion } from "@loyalty/shared/api";
import type { ActorFields } from "@loyalty/shared/logging/events";
import type { z } from "zod";
import { log } from "../observability/logger";
import { supabaseAdmin } from "../supabase";
import type { Shop } from "../types";
import { callDomain, staffMeta } from "./domain-call";

interface Row {
  id: string;
  body: string;
  status: "queued" | "sending" | "sent" | "cancelled";
  recipients_estimated: number;
  created_at: string;
}

const toPromotion = (r: Row): z.input<typeof Promotion> => ({
  id: r.id,
  text: r.body,
  status: r.status,
  recipients: r.recipients_estimated,
  createdAt: new Date(r.created_at).toISOString(),
});

export async function listPromotions(shop: Shop) {
  const { data, error } = await supabaseAdmin()
    .from("promotions")
    .select("id, body, status, recipients_estimated, created_at")
    .eq("shop_id", shop.id)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw error;
  return { promotions: ((data ?? []) as Row[]).map(toPromotion) };
}

/** Prenota l'invio (una a settimana, solo clienti con consenso). L'invio ai wallet è della Fase 4. */
export async function queuePromotion(shop: Shop, text: string, userId: string, actor: ActorFields) {
  const r = await callDomain<{ promotion_id: string; recipients_estimated: number; created_at: string }>(
    "queue_promotion",
    { p_shop_id: shop.id, p_body: text, p_meta: staffMeta(userId) },
  );
  log.event("promo.send.queued", {
    ...actor,
    shop_name: shop.name,
    promotion_id: r.promotion_id,
    recipients: r.recipients_estimated,
    chars: text.trim().length,
  });
  return {
    promotion: toPromotion({
      id: r.promotion_id,
      body: text.trim(),
      status: "queued",
      recipients_estimated: r.recipients_estimated,
      created_at: r.created_at,
    }),
  };
}
