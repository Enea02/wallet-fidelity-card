import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { defineConfig } from "vitest/config";
import base from "./vitest.config";

/** Chiavi del Supabase locale lette da `supabase status`: lo smoke test richiede `pnpm db:start`. */
function localSupabaseEnv(): Record<string, string> {
  let status: Record<string, string>;
  try {
    const out = execFileSync("supabase", ["status", "-o", "json"], { stdio: ["ignore", "pipe", "ignore"] });
    status = JSON.parse(out.toString()) as Record<string, string>;
  } catch {
    throw new Error("Supabase locale non attivo: eseguire `pnpm db:start` prima di `pnpm test:smoke`.");
  }
  return {
    APP_BASE_URL: "http://localhost:3000",
    NEXT_PUBLIC_SUPABASE_URL: status.API_URL ?? "",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: status.ANON_KEY ?? "",
    SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY ?? "",
    IP_HASH_SALT: "smoke-test-salt-0123456789",
    LOG_TRANSPORT: "none",
    MERCHANT_APP_ORIGINS: "http://localhost:8081",
    MERCHANT_APP_URL: "http://localhost:8081",
    // i test girano tutti dallo stesso "IP": limiti alti, il test del rate limit usa un IP dedicato
    RATE_LIMIT_USER_PER_MIN: "100000",
    RATE_LIMIT_IP_PER_MIN: "100000",
    JWT_SECRET: status.JWT_SECRET ?? "",
    MAILPIT_URL: status.MAILPIT_URL ?? status.INBUCKET_URL ?? "",
    // segreti di prova generati a ogni esecuzione: nel repository niente stringhe con forma di segreto
    CRON_SECRET: randomBytes(32).toString("hex"),
    UNSUBSCRIBE_SECRET: randomBytes(32).toString("hex"),
    // il lavoro verso i wallet (after() di Next) gira subito, prima della risposta: test deterministici
    WALLET_SYNC_INLINE: "1",
    // lo smoke test verifica il percorso senza Google Wallet
    GOOGLE_WALLET_ISSUER_ID: "",
    GOOGLE_WALLET_SA_KEY_B64: "",
  };
}

// configurazione separata (non mergeConfig: concatenerebbe include/exclude della base,
// che esclude proprio i file *.smoke.test.ts); dalla base si riprendono solo gli alias
export default defineConfig({
  resolve: base.resolve ?? {},
  test: {
    include: ["test/**/*.smoke.test.ts"],
    globalSetup: ["test/support/global-setup.ts"],
    env: localSupabaseEnv(),
    testTimeout: 20_000,
  },
});
