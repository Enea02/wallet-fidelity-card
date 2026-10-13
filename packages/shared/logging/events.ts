/**
 * Catalogo degli eventi di log. Si possono loggare SOLO eventi presenti qui
 * (lo impone il tipo di `logEvent`). Nome stabile `dominio.oggetto.azione[.esito]`,
 * campi strutturati tipizzati e template del `msg` in italiano.
 * Fase 0: solo gli eventi di avvio; la Fase 1 completa il catalogo.
 */
import type { ErrorCode } from "../errors";

export type LogLevel = "trace" | "debug" | "info" | "warn" | "error";

export interface EventDef<F> {
  level: LogLevel;
  /** A cosa serve l'evento, per il runbook dell'assistenza. */
  description: string;
  /** Frase completa e autosufficiente, con i valori concreti. */
  msg: (fields: F) => string;
  /** Dati di esempio: usati dai test sui template e dal runbook. */
  example: F;
}

const defineEvent = <F>(def: EventDef<F>): EventDef<F> => def;

export interface ServerStartupOkFields {
  app: string;
  env: string;
  version: string;
  commit: string;
  node_version: string;
  supabase_host: string;
  google_wallet_enabled: boolean;
  apple_wallet_enabled: boolean;
  log_level: LogLevel;
}

export interface ServerStartupFailedFields {
  app: string;
  env: string;
  version: string;
  error_code: ErrorCode;
  missing: string[];
  invalid: string[];
}

const onOff = (b: boolean) => (b ? "attivo" : "disattivato");
const names = (list: string[]) => (list.length > 0 ? list.join(", ") : "nessuna");

export const events = {
  "server.startup.ok": defineEvent<ServerStartupOkFields>({
    level: "info",
    description: "Il server è partito e la configurazione è valida. Riepiloga ambiente, versione e servizi attivi.",
    msg: (f) =>
      `Server ${f.app} avviato in ambiente ${f.env}, versione ${f.version} (commit ${f.commit}), Node ${f.node_version}: ` +
      `database Supabase su ${f.supabase_host}, Google Wallet ${onOff(f.google_wallet_enabled)}, ` +
      `Apple Wallet ${onOff(f.apple_wallet_enabled)}, livello di log ${f.log_level}.`,
    example: {
      app: "web",
      env: "development",
      version: "0.1.0",
      commit: "a1b2c3d",
      node_version: "24.15.0",
      supabase_host: "127.0.0.1:54321",
      google_wallet_enabled: false,
      apple_wallet_enabled: false,
      log_level: "info",
    },
  }),
  "server.startup.failed": defineEvent<ServerStartupFailedFields>({
    level: "error",
    description: "Il server non è partito perché la configurazione non è valida. Elenca le variabili da correggere.",
    msg: (f) =>
      `Avvio del server ${f.app} (ambiente ${f.env}, versione ${f.version}) bloccato: configurazione non valida. ` +
      `Variabili mancanti: ${names(f.missing)}. Variabili con formato errato: ${names(f.invalid)}. ` +
      `Azione: impostarle confrontando apps/${f.app}/.env.example e riavviare.`,
    example: {
      app: "web",
      env: "production",
      version: "0.1.0",
      error_code: "E_CONFIG_INVALID",
      missing: ["SUPABASE_SERVICE_ROLE_KEY"],
      invalid: ["APP_BASE_URL"],
    },
  }),
} as const;

export type EventName = keyof typeof events;
export type EventFields<E extends EventName> = (typeof events)[E] extends EventDef<infer F> ? F : never;
