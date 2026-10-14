import "server-only";
import { log } from "../observability/logger";
import { sendPromotions } from "./promotions-sender";
import { processDueRetries, reconcile } from "./sync";

const BATCH = 50;

/**
 * Lavoro del cron dei wallet (ogni minuto, da pg_cron): nuovi tentativi, riconciliazione delle
 * carte rimaste indietro, invio delle promozioni. Una riga di riepilogo solo se c'è stato lavoro.
 */
export async function runWalletCron() {
  const started = performance.now();
  const retries = await processDueRetries(BATCH);
  const reconciled = await reconcile(BATCH);
  const promo = await sendPromotions(BATCH);
  const summary = {
    retries: retries.total,
    retries_ok: retries.ok,
    reconciled,
    promo_sent: promo.sent,
    promo_failed: promo.failed,
    duration_ms: Math.round(performance.now() - started),
  };
  if (retries.total + reconciled + promo.sent + promo.failed > 0) log.event("cron.wallet_sync.run", summary);
  return summary;
}
