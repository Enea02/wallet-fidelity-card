import { z } from "zod";
import { parseEnv } from "@loyalty/shared/env";

/**
 * Variabili d'ambiente del server web, validate all'avvio (vedi src/instrumentation.ts).
 * Ogni voce ha una descrizione: compare nel messaggio d'errore se manca.
 * Tenere allineato con apps/web/.env.example.
 */
const serviceAccountKey = z.string().refine(
  (b64) => {
    try {
      const key = JSON.parse(Buffer.from(b64, "base64").toString("utf8")) as Record<string, unknown>;
      return typeof key.client_email === "string" && typeof key.private_key === "string";
    } catch {
      return false;
    }
  },
  { message: "non è il base64 di una chiave JSON di service account (servono client_email e private_key)" },
);

export const serverEnvSchema = z
  .object({
    APP_ENV: z
      .enum(["development", "test", "production"])
      .default("development")
      .describe("ambiente: development, test o production"),
    LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error"]).default("info").describe("livello minimo dei log"),
    APP_BASE_URL: z.url().describe("URL pubblico del sito, es. http://localhost:3000"),
    NEXT_PUBLIC_SUPABASE_URL: z.url().describe("URL del progetto Supabase (in locale: pnpm db:start lo stampa)"),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().describe("chiave pubblica (anon) di Supabase, usata dal login staff"),
    SUPABASE_SERVICE_ROLE_KEY: z.string().describe("chiave service role di Supabase, solo lato server"),
    ADMIN_SETUP_TOKEN: z
      .string()
      .min(24, { message: "troppo corto: usare almeno 24 caratteri casuali (openssl rand -hex 24)" })
      .describe("token per POST /api/admin/setup-class, almeno 24 caratteri casuali"),
    GOOGLE_WALLET_ISSUER_ID: z
      .string()
      .regex(/^\d+$/, { message: "deve contenere solo cifre (Issuer ID dalla Google Pay & Wallet Console)" })
      .optional()
      .describe("Issuer ID di Google Wallet; vuoto = Google Wallet disattivato"),
    GOOGLE_WALLET_SA_KEY_B64: serviceAccountKey
      .optional()
      .describe("chiave JSON del service account Google codificata in base64 (base64 -i chiave.json)"),
    APPLE_PASS_TYPE_ID: z.string().optional().describe("Pass Type ID Apple; vuoto = Apple Wallet disattivato"),
    APPLE_TEAM_ID: z.string().optional().describe("Team ID Apple Developer"),
  })
  .superRefine((env, ctx) => {
    const google = [env.GOOGLE_WALLET_ISSUER_ID, env.GOOGLE_WALLET_SA_KEY_B64];
    if (google.some(Boolean) && !google.every(Boolean)) {
      ctx.addIssue({
        code: "custom",
        path: [env.GOOGLE_WALLET_ISSUER_ID ? "GOOGLE_WALLET_SA_KEY_B64" : "GOOGLE_WALLET_ISSUER_ID"],
        message:
          "Google Wallet richiede sia GOOGLE_WALLET_ISSUER_ID sia GOOGLE_WALLET_SA_KEY_B64 (o nessuna delle due)",
      });
    }
  });

export type ServerEnv = z.output<typeof serverEnvSchema>;

export function loadServerEnv(source: Record<string, string | undefined> = process.env): ServerEnv {
  return parseEnv("web", serverEnvSchema, source);
}
