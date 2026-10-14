import "server-only";
import { log } from "../observability/logger";
import { supabaseAdmin } from "../supabase";
import { googleEnabled } from "./google/config";
import { loadShop, sendCardMessage } from "./sync";
import { unsubscribeUrl } from "./unsubscribe";

/*
 * Invio delle promozioni prenotate dal titolare (tabella promotion_deliveries): una consegna per
 * cliente, consenso ricontrollato al momento dell'invio, id del messaggio fisso per promozione
 * (promo-<id>) così un nuovo tentativo non duplica mai il messaggio sul telefono.
 */

const RETRY_MIN = [1, 5, 15] as const;

interface Delivery {
  promotion_id: string;
  customer_id: string;
  shop_id: string;
  body: string;
  attempts: number;
  consent: boolean;
  deleted: boolean;
}

interface Completion {
  completed: boolean;
  sent?: number;
  skipped?: number;
  failed?: number;
}

async function recordDelivery(
  d: Delivery,
  status: "sent" | "skipped" | "failed",
  extra: { errorCode?: string; error?: string; skipReason?: string } = {},
): Promise<void> {
  const { data, error } = await supabaseAdmin().rpc("promotion_delivery_record", {
    p_promotion_id: d.promotion_id,
    p_customer_id: d.customer_id,
    p_status: status,
    p_error_code: extra.errorCode ?? null,
    p_error: extra.error ?? null,
    p_skip_reason: extra.skipReason ?? null,
  });
  if (error) throw error;
  const c = data as Completion;
  if (c.completed) {
    const shop = await loadShop(d.shop_id);
    log.event("promo.send.completed", {
      shop_name: shop.name,
      promotion_id: d.promotion_id,
      sent: c.sent ?? 0,
      skipped: c.skipped ?? 0,
      failed: c.failed ?? 0,
    });
  }
}

/** Consegna fino a `limit` messaggi promozionali. */
export async function sendPromotions(limit: number): Promise<{ sent: number; failed: number }> {
  if (!googleEnabled()) return { sent: 0, failed: 0 };
  const db = supabaseAdmin();
  const prepared = await db.rpc("promotions_prepare");
  if (prepared.error) throw prepared.error;

  const empty = await db.rpc("promotions_close_empty");
  if (empty.error) throw empty.error;
  for (const p of (empty.data ?? []) as Array<{ id: string; shop_id: string }>) {
    const shop = await loadShop(p.shop_id);
    log.event("promo.send.completed", { shop_name: shop.name, promotion_id: p.id, sent: 0, skipped: 0, failed: 0 });
  }

  const { data, error } = await db.rpc("promotion_deliveries_claim", { p_limit: limit });
  if (error) throw error;
  let sent = 0;
  let failed = 0;
  for (const d of (data ?? []) as Delivery[]) {
    if (!d.consent || d.deleted) {
      await recordDelivery(d, "skipped", { skipReason: d.deleted ? "cliente cancellato" : "consenso revocato" });
      continue;
    }
    const shop = await loadShop(d.shop_id);
    const r = await sendCardMessage(
      d.customer_id,
      {
        id: `promo-${d.promotion_id}`,
        header: shop.name,
        body: `${d.body}\n\nNon vuoi più ricevere promozioni? ${unsubscribeUrl(d.customer_id, d.promotion_id)}`,
        kind: "promozione",
      },
      {
        attempt: d.attempts + 1,
        retryInMin: (f) => (f.code === "E_GOOGLE_NOT_FOUND" ? null : (RETRY_MIN[d.attempts] ?? null)),
      },
    );
    if (r.ok) {
      sent += 1;
      await recordDelivery(d, "sent");
    } else if (r.failure.code === "E_GOOGLE_NOT_FOUND") {
      // la carta non esiste su Google (cliente mai arrivato al Wallet): niente da consegnare
      await recordDelivery(d, "skipped", { skipReason: "carta non presente su Google Wallet" });
    } else {
      failed += 1;
      await recordDelivery(d, "failed", { errorCode: r.failure.code, error: r.failure.providerResponse });
    }
  }
  return { sent, failed };
}
