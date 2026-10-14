import { execFileSync } from "node:child_process";
import { generateKeyPairSync, randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

/*
 * Test end-to-end del web pubblico (Fase 5) contro la build di produzione (`next build` prima)
 * e il Supabase locale (`pnpm db:start`). OTP di prova (123456) e chiavi di prova di Turnstile.
 * I log JSON del server finiscono in e2e-logs/server.log: l'ultimo test controlla che non
 * contengano telefoni né nomi.
 */
const PORT = 3100;
const status = JSON.parse(
  execFileSync("supabase", ["status", "-o", "json"], { stdio: ["ignore", "pipe", "ignore"] }).toString(),
) as Record<string, string>;
mkdirSync("e2e-logs", { recursive: true });

// segreti generati una volta per esecuzione e condivisi con i test (firma dei link di disiscrizione)
process.env.E2E_UNSUBSCRIBE_SECRET ??= randomBytes(32).toString("hex");

// Google Wallet "configurato" con una chiave di prova: il link "Salva in Google Wallet" si firma in locale;
// le chiamate all'API Google vanno a una porta chiusa e falliscono senza effetti (registrate e ritentate)
const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const googleKey = Buffer.from(
  JSON.stringify({
    type: "service_account",
    client_email: "e2e@progetto-di-prova.iam.gserviceaccount.com",
    private_key: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    token_uri: "http://127.0.0.1:9/token",
  }),
).toString("base64");

const serverEnv: Record<string, string> = {
  GOOGLE_WALLET_ISSUER_ID: "3388000000099999999",
  GOOGLE_WALLET_SA_KEY_B64: googleKey,
  GOOGLE_WALLET_API_BASE: "http://127.0.0.1:9",
  CARD_DEFAULT_LOGO_URL: "https://esempio.test/logo.png",
  APP_ENV: "test",
  NODE_ENV: "production",
  LOG_FORMAT: "json",
  APP_BASE_URL: `http://localhost:${PORT}`,
  NEXT_PUBLIC_SUPABASE_URL: status.API_URL ?? "",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: status.ANON_KEY ?? "",
  SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY ?? "",
  IP_HASH_SALT: randomBytes(16).toString("hex"),
  ADMIN_SETUP_TOKEN: randomBytes(24).toString("hex"),
  CRON_SECRET: randomBytes(32).toString("hex"),
  UNSUBSCRIBE_SECRET: process.env.E2E_UNSUBSCRIBE_SECRET,
  PUBLIC_LINK_SECRET: randomBytes(32).toString("hex"),
  MERCHANT_APP_ORIGINS: "http://localhost:8081",
  OTP_PROVIDER: "test",
  // chiavi di prova pubbliche di Cloudflare Turnstile: il widget passa sempre
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
  TURNSTILE_SECRET_KEY: "1x0000000000000000000000000000000AA",
  // tutte le richieste arrivano da localhost: limiti alti
  OTP_LIMIT_PER_IP_HOUR: "100000",
  RATE_LIMIT_IP_PER_MIN: "100000",
  RATE_LIMIT_USER_PER_MIN: "100000",
};

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: { baseURL: `http://localhost:${PORT}`, locale: "it-IT", trace: "retain-on-failure" },
  webServer: {
    command: `sh -c 'exec node_modules/.bin/next start -p ${PORT} > e2e-logs/server.log 2>&1'`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: serverEnv,
  },
  projects: [
    { name: "iscrizione", testMatch: /enroll\.spec\.ts/, use: { ...devices["Pixel 7"] } },
    { name: "privacy", testMatch: /privacy\.spec\.ts/, dependencies: ["iscrizione"] },
  ],
});
