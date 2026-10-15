import "server-only";
import { after } from "next/server";
import { getContext, runWithContext } from "../observability/context";
import { flushLogs } from "../observability/db-sink";
import { log } from "../observability/logger";

/**
 * Esegue il lavoro verso i wallet DOPO aver risposto all'app (after() di Next), con lo stesso
 * contesto di log della richiesta (request_id, negozio, carta). Se non riesce o non parte,
 * lo recuperano i tentativi e la riconciliazione del cron.
 * WALLET_SYNC_INLINE=1 (test) lo esegue subito, prima della risposta.
 */
export function deferWalletWork(what: string, task: () => Promise<unknown>): Promise<void> {
  const ctx = getContext();
  const run = async () => {
    try {
      await (ctx ? runWithContext(ctx, task) : task());
    } catch (e) {
      log.event(
        "wallet.sync.unexpected_error",
        { task: what, error_message: e instanceof Error ? e.message : String(e) },
        { error: e },
      );
    } finally {
      // le righe del lavoro verso i wallet arrivano dopo la risposta: si copiano subito
      await flushLogs();
    }
  };
  if (process.env.WALLET_SYNC_INLINE === "1") return run();
  try {
    after(run);
    return Promise.resolve();
  } catch {
    // fuori da una richiesta Next (script, test): si esegue subito
    return run();
  }
}
