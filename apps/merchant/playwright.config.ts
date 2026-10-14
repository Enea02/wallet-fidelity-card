import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, devices } from "@playwright/test";

/*
 * Test end-to-end della web app esercente (Fase 6) contro:
 * - il backend Next già compilato (apps/web: `pnpm --filter @loyalty/web build`) sulla porta 3110;
 * - la web app esportata con `expo export` (build di produzione, ambiente "test") sulla porta 8090;
 * - il Supabase locale (`pnpm db:start`), con Mailpit per le email di invito e recupero password.
 * I log JSON del backend finiscono in e2e-logs/server.log: i test ci cercano codici assistenza e ticket.
 */
const API_PORT = 3110;
const APP_PORT = 8090;
const status = JSON.parse(
  execFileSync("supabase", ["status", "-o", "json"], { stdio: ["ignore", "pipe", "ignore"] }).toString(),
) as Record<string, string>;
mkdirSync("e2e-logs", { recursive: true });

const appOrigin = `http://localhost:${APP_PORT}`;
const serverEnv: Record<string, string> = {
  APP_ENV: "test",
  NODE_ENV: "production",
  LOG_FORMAT: "json",
  APP_BASE_URL: `http://localhost:${API_PORT}`,
  NEXT_PUBLIC_SUPABASE_URL: status.API_URL ?? "",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: status.ANON_KEY ?? "",
  SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY ?? "",
  IP_HASH_SALT: randomBytes(16).toString("hex"),
  ADMIN_SETUP_TOKEN: randomBytes(24).toString("hex"),
  CRON_SECRET: randomBytes(32).toString("hex"),
  UNSUBSCRIBE_SECRET: randomBytes(32).toString("hex"),
  PUBLIC_LINK_SECRET: randomBytes(32).toString("hex"),
  MERCHANT_APP_ORIGINS: appOrigin,
  MERCHANT_APP_URL: appOrigin,
  OTP_PROVIDER: "test",
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
  TURNSTILE_SECRET_KEY: "1x0000000000000000000000000000000AA",
  RATE_LIMIT_IP_PER_MIN: "100000",
  RATE_LIMIT_USER_PER_MIN: "100000",
};

const appEnv: Record<string, string> = {
  EXPO_PUBLIC_API_URL: `http://localhost:${API_PORT}`,
  EXPO_PUBLIC_SUPABASE_URL: status.API_URL ?? "",
  EXPO_PUBLIC_SUPABASE_ANON_KEY: status.ANON_KEY ?? "",
  EXPO_PUBLIC_WEB_URL: appOrigin,
  // "test": build di produzione con gli strumenti di prova del profilo (errore forzato)
  EXPO_PUBLIC_APP_ENV: "test",
  EXPO_PUBLIC_SENTRY_DSN: "",
};

export default defineConfig({
  testDir: "e2e",
  // video finto con il QR della carta demo, per la fotocamera del browser (progetto "fotocamera")
  globalSetup: "./e2e/fake-camera.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: { baseURL: appOrigin, locale: "it-IT", trace: "retain-on-failure" },
  webServer: [
    {
      command: `sh -c 'cd ../web && exec node_modules/.bin/next start -p ${API_PORT} > ../merchant/e2e-logs/server.log 2>&1'`,
      url: `http://localhost:${API_PORT}/`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: serverEnv,
    },
    {
      command: `sh -c 'node scripts/copy-zxing.mjs > /dev/null && node_modules/.bin/expo export --platform web --output-dir dist-e2e > e2e-logs/export.log 2>&1 && exec node e2e/serve.mjs dist-e2e ${APP_PORT}'`,
      url: appOrigin,
      reuseExistingServer: false,
      timeout: 300_000,
      env: appEnv,
    },
  ],
  projects: [
    { name: "telefono", testMatch: /(app|scanner)\.spec\.ts/, use: { ...devices["Pixel 7"] } },
    {
      name: "fotocamera",
      testMatch: /camera\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        permissions: ["camera"],
        launchOptions: {
          args: [
            "--use-fake-ui-for-media-stream",
            "--use-fake-device-for-media-stream",
            `--use-file-for-fake-video-capture=${resolve("e2e-logs/qr-demo.mjpeg")}`,
          ],
        },
      },
    },
    {
      name: "desktop",
      testMatch: /desktop\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
    },
  ],
});
