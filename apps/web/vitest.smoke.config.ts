import { execFileSync } from "node:child_process";
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
    env: localSupabaseEnv(),
    testTimeout: 20_000,
  },
});
