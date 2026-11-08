import { AppError } from "@loyalty/shared/errors";
import { log } from "./observability/logger";
import { loadServerEnv } from "./server-env";

/**
 * Controlli di avvio del server (solo runtime Node, chiamato da src/instrumentation.ts).
 * Valida la configurazione e scrive la riga di riepilogo `server.startup.ok`;
 * se la configurazione non è valida scrive `server.startup.failed` e blocca l'avvio.
 */
/** Web app esercente: bundle copiato in public/app al momento della build (MERCHANT_APP_BUNDLE, next.config.ts). */
function merchantAppStatus(devUrl: string | undefined): string {
  if (devUrl && process.env.NODE_ENV !== "production") return `da Metro su ${devUrl} (sviluppo)`;
  const bundle = process.env.MERCHANT_APP_BUNDLE;
  return bundle ? `inclusa (${bundle})` : "assente";
}

export function runStartupChecks(): void {
  const version = process.env.APP_VERSION ?? "sconosciuta";
  try {
    const env = loadServerEnv();
    log.event("server.startup.ok", {
      app: "web",
      env: env.APP_ENV,
      version,
      commit: process.env.APP_COMMIT_SHA ?? "sconosciuto",
      node_version: process.versions.node,
      supabase_host: new URL(env.NEXT_PUBLIC_SUPABASE_URL).host,
      google_wallet_enabled: Boolean(env.GOOGLE_WALLET_ISSUER_ID && env.GOOGLE_WALLET_SA_KEY_B64),
      apple_wallet_enabled: Boolean(env.APPLE_PASS_TYPE_ID && env.APPLE_TEAM_ID),
      log_level: env.LOG_LEVEL,
      merchant_app: merchantAppStatus(env.MERCHANT_DEV_URL),
    });
  } catch (e) {
    if (!(e instanceof AppError) || e.code !== "E_CONFIG_INVALID") throw e;
    log.event("server.startup.failed", {
      app: "web",
      env: process.env.APP_ENV ?? "development",
      version,
      error_code: e.code,
      missing: (e.context.missing as string[] | undefined) ?? [],
      invalid: (e.context.invalid as string[] | undefined) ?? [],
    });
    // dettaglio con la spiegazione di ogni variabile, poi stop: meglio non partire che partire a metà
    process.stderr.write(`\n${e.message}\n\n`);
    process.exit(1);
  }
}
