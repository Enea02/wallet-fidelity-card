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
    LOG_FORMAT: z
      .enum(["json", "pretty"])
      .optional()
      .describe("formato dei log: json (default in produzione) o pretty (default in sviluppo)"),
    LOG_TRANSPORT: z
      .enum(["stdout", "none"])
      .default("stdout")
      .describe("destinazione dei log: stdout (inoltrato dal Log Drain di Vercel) o none"),
    LOG_DB_SINK: z
      .enum(["on", "off"])
      .optional()
      .describe("copia dei log in Postgres per la vista Assistenza del pannello interno (default on)"),
    IP_HASH_SALT: z
      .string()
      .min(16, { message: "troppo corto: usare almeno 16 caratteri casuali (openssl rand -hex 16)" })
      .describe("salt segreto per salvare gli IP solo come hash, almeno 16 caratteri casuali"),
    APP_BASE_URL: z.url().describe("URL pubblico del sito, es. http://localhost:3000"),
    NEXT_PUBLIC_SUPABASE_URL: z.url().describe("URL del progetto Supabase (in locale: pnpm db:start lo stampa)"),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().describe("chiave pubblica (anon) di Supabase, usata dal login staff"),
    SUPABASE_SERVICE_ROLE_KEY: z.string().describe("chiave service role di Supabase, solo lato server"),
    MERCHANT_APP_ORIGINS: z
      .string()
      .refine((v) => v.split(",").every((o) => URL.canParse(o.trim()) && !o.trim().endsWith("/")), {
        message:
          "elenco di origini separate da virgola, es. https://app.esempio.it,http://localhost:8081 (senza / finale)",
      })
      .describe("origini della web app esercente ammesse da CORS, separate da virgola"),
    MERCHANT_APP_URL: z
      .url()
      .optional()
      .describe("URL della web app esercente per i link d'invito (default APP_BASE_URL)"),
    RATE_LIMIT_USER_PER_MIN: z.coerce.number().int().positive().default(120).describe("richieste al minuto per utente"),
    RATE_LIMIT_IP_PER_MIN: z.coerce.number().int().positive().default(300).describe("richieste al minuto per IP"),
    CRON_SECRET: z
      .string()
      .min(32, { message: "troppo corto: usare almeno 32 caratteri casuali (openssl rand -hex 32)" })
      .describe("segreto con cui pg_cron chiama /api/internal/cron/wallet-sync (anche nel Vault di Supabase)"),
    UNSUBSCRIBE_SECRET: z
      .string()
      .min(32, { message: "troppo corto: usare almeno 32 caratteri casuali (openssl rand -hex 32)" })
      .describe("segreto che firma i link di disiscrizione dalle promozioni"),
    CARD_DEFAULT_LOGO_URL: z
      .url()
      .optional()
      .describe("logo PNG pubblico per i negozi senza logo (default APP_BASE_URL/brand/logo-predefinito.png)"),
    SUPABASE_PUBLIC_URL: z
      .url()
      .optional()
      .describe(
        "solo sviluppo: indirizzo pubblico di Supabase (tunnel) per gli URL dei loghi che Google deve scaricare",
      ),
    GOOGLE_WALLET_API_BASE: z.url().optional().describe("solo test: base dell'API Google Wallet simulata"),
    OTP_PROVIDER: z
      .enum(["twilio", "test"])
      .default("test")
      .describe("fornitore del codice SMS: twilio (SMS veri) o test (codice 123456, mai in produzione)"),
    TWILIO_ACCOUNT_SID: z
      .string()
      .regex(/^AC[0-9a-f]{32}$/, { message: "deve iniziare con AC seguito da 32 caratteri esadecimali" })
      .optional()
      .describe("Account SID di Twilio (console Twilio → Account Info)"),
    TWILIO_AUTH_TOKEN: z.string().min(32).optional().describe("Auth Token di Twilio (console Twilio → Account Info)"),
    TWILIO_VERIFY_SERVICE_SID: z
      .string()
      .regex(/^VA[0-9a-f]{32}$/, { message: "deve iniziare con VA seguito da 32 caratteri esadecimali" })
      .optional()
      .describe("SID del servizio Twilio Verify (Verify → Services)"),
    TWILIO_VERIFY_API_BASE: z.url().optional().describe("solo test: API Twilio Verify simulata"),
    OTP_LIMIT_PER_NUMBER_HOUR: z.coerce.number().int().positive().default(3).describe("SMS all'ora per numero"),
    OTP_LIMIT_PER_NUMBER_DAY: z.coerce.number().int().positive().default(5).describe("SMS al giorno per numero"),
    OTP_LIMIT_PER_IP_HOUR: z.coerce.number().int().positive().default(10).describe("SMS all'ora per IP"),
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.string().min(10).describe("site key di Cloudflare Turnstile (pubblica)"),
    TURNSTILE_SECRET_KEY: z.string().min(10).describe("secret key di Cloudflare Turnstile"),
    TURNSTILE_VERIFY_URL: z.url().optional().describe("solo test: verifica Turnstile simulata"),
    PUBLIC_LINK_SECRET: z
      .string()
      .min(32, { message: "troppo corto: usare almeno 32 caratteri casuali (openssl rand -hex 32)" })
      .describe("firma dei link brevi per aprire la carta dal telefono"),
    PROCESSOR_NAME: z
      .string()
      .optional()
      .describe("informativa: ragione sociale del responsabile del trattamento (noi)"),
    PROCESSOR_ADDRESS: z.string().optional().describe("informativa: sede del responsabile del trattamento"),
    PROCESSOR_VAT: z.string().optional().describe("informativa: partita IVA del responsabile del trattamento"),
    PROCESSOR_EMAIL: z.string().optional().describe("informativa: email privacy del responsabile del trattamento"),
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
    if (env.APP_ENV === "production" && env.OTP_PROVIDER !== "twilio") {
      ctx.addIssue({
        code: "custom",
        path: ["OTP_PROVIDER"],
        message: "in produzione deve essere twilio: il fornitore di prova accetta sempre il codice 123456",
      });
    }
    if (env.OTP_PROVIDER === "twilio") {
      for (const k of ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_VERIFY_SERVICE_SID"] as const) {
        if (!env[k])
          ctx.addIssue({ code: "custom", path: [k], message: `${k} è obbligatoria con OTP_PROVIDER=twilio` });
      }
    }
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
