import { execFileSync } from "node:child_process";
import { defineConfig, mergeConfig } from "vitest/config";
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
    // lo smoke test verifica il percorso senza Google Wallet
    GOOGLE_WALLET_ISSUER_ID: "",
    GOOGLE_WALLET_SA_KEY_B64: "",
  };
}

export default mergeConfig(
  base,
  defineConfig({
    test: {
      include: ["test/**/*.smoke.test.ts"],
      exclude: ["node_modules/**"],
      env: localSupabaseEnv(),
      testTimeout: 20_000,
    },
  }),
);
