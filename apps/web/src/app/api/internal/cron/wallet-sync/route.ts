import { timingSafeEqual } from "node:crypto";
import { AppError } from "@loyalty/shared/errors";
import { requireEnv } from "@/lib/env";
import { withApi } from "@/lib/observability/with-api";
import { runWalletCron } from "@/lib/wallet/cron";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Chiamato ogni minuto da pg_cron (supabase/migrations/*_cron.sql) con "Authorization: Bearer CRON_SECRET".
 * Log di richiesta a livello debug: il riepilogo utile è cron.wallet_sync.run.
 */
export const POST = withApi(
  async (req) => {
    const given = Buffer.from((req.headers.get("authorization") ?? "").replace(/^Bearer /, ""));
    const expected = Buffer.from(requireEnv("CRON_SECRET"));
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
      throw new AppError("E_CRON_UNAUTHORIZED", "chiamata al cron dei wallet senza CRON_SECRET valido");
    }
    return Response.json(await runWalletCron());
  },
  { quiet: true },
);
