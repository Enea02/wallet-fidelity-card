import "server-only";
import { log } from "../observability/logger";
import { supabaseAdmin } from "../supabase";
import { sendPromotions } from "./promotions-sender";
import { processDueRetries, reconcile } from "./sync";

const BATCH = 50;

/**
 * Lavoro del cron (ogni minuto, da pg_cron): nuovi tentativi verso i wallet, riconciliazione delle
 * carte rimaste indietro, invio delle promozioni, pulizia delle iscrizioni non completate e dei log
 * copiati per la vista Assistenza.
 * Una riga di riepilogo solo se c'è stato lavoro verso i wallet.
 */
export async function runWalletCron() {
  const started = performance.now();
  const retries = await processDueRetries(BATCH);
  const reconciled = await reconcile(BATCH);
  const promo = await sendPromotions(BATCH);
  // iscrizioni dal web non completate: nome e telefono via dopo 24 ore
  const { error } = await supabaseAdmin().rpc("enrollment_cleanup");
  if (error) throw error;
  // chiavi di idempotenza delle azioni sul saldo: servono solo per i tentativi ravvicinati (48 ore)
  const { error: keysError } = await supabaseAdmin().rpc("action_keys_cleanup");
  if (keysError) throw keysError;
  // log copiati per la vista Assistenza: 30 giorni, 7 quelli di modalità diagnostica (a lotti)
  const { data: purged, error: purgeError } = await supabaseAdmin().rpc("purge_log_events", { p_limit: 5000 });
  if (purgeError) throw purgeError;
  const { expired = 0, diagnostic = 0 } = (purged ?? {}) as { expired?: number; diagnostic?: number };
  if (expired + diagnostic > 0) log.event("log.retention.purged", { expired, diagnostic });
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
