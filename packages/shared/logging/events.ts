/**
 * Catalogo degli eventi di log. Si possono loggare SOLO eventi presenti qui
 * (lo impone il tipo di `log.event`). Nome stabile `dominio.oggetto.azione[.esito]`,
 * livello di default, campi strutturati tipizzati e template del `msg` in italiano:
 * una frase completa che dice chi ha fatto cosa, su cosa, con che esito e, se è fallito,
 * perché e cosa fare. I campi standard (request_id, shop_id, user_id, …) li aggiunge il logger.
 */
import type { ErrorCode } from "../errors";

export type LogLevel = "trace" | "debug" | "info" | "warn" | "error";

export interface EventDef<F> {
  level: LogLevel;
  /** A cosa serve l'evento, per il runbook dell'assistenza. */
  description: string;
  /** Frase completa e autosufficiente, con i valori concreti. */
  msg: (fields: F) => string;
  /** Dati di esempio (almeno uno per ogni variante del msg): test dei template e runbook. */
  examples: readonly [F, ...F[]];
}

const defineEvent = <F>(def: EventDef<F>): EventDef<F> => def;

const onOff = (b: boolean) => (b ? "attivo" : "disattivato");
const names = (list: string[]) => (list.length > 0 ? list.join(", ") : "nessuna");
const romeTime = new Intl.DateTimeFormat("it-IT", {
  timeZone: "Europe/Rome",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
/** Data ISO → "04/11/2026 10:00 (ora italiana)": nei msg le date si leggono in ora locale. */
const when = (iso: string) => `${romeTime.format(new Date(iso)).replace(",", "")} (ora italiana)`;
const bytes = (n: number) => (n < 1024 ? `${n} byte` : `${(n / 1024).toFixed(1)} KB`);

export type DiagnosticScopeType = "shop" | "staff_user" | "customer";
const SCOPE_LABEL: Record<DiagnosticScopeType, string> = {
  shop: "negozio",
  staff_user: "utente staff",
  customer: "cliente",
};
const scope = (f: { scope_type: DiagnosticScopeType; scope_label: string }) =>
  `${SCOPE_LABEL[f.scope_type]} ${f.scope_label}`;

/* ------------------------------------------------------------------ */
/* Campi degli eventi                                                  */
/* ------------------------------------------------------------------ */

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

export interface HttpRequestStartFields {
  method: string;
  route: string;
  /** ios | android | web | public-web | sconosciuta */
  platform: string;
  app_version: string;
  ip_hash: string;
}

export interface HttpRequestEndFields {
  method: string;
  route: string;
  status: number;
  duration_ms: number;
  /** Valorizzati solo se la richiesta è finita con un errore del catalogo. */
  error_code: ErrorCode | null;
  error_message: string | null;
  support_code: string;
}

export interface HttpRequestFailedFields {
  method: string;
  route: string;
  status: number;
  duration_ms: number;
  error_code: ErrorCode;
  error_message: string;
  support_code: string;
}

export interface HttpRequestPayloadFields {
  direction: "richiesta" | "risposta";
  method: string;
  route: string;
  size_bytes: number;
  /** Body già redatto e troncato. */
  body: unknown;
}

export interface ExternalCallOkFields {
  provider: string;
  operation: string;
  method: string;
  endpoint: string;
  http_status: number;
  duration_ms: number;
  attempt: number;
  object_id: string | null;
}

export interface ExternalCallFailedFields {
  provider: string;
  operation: string;
  method: string;
  endpoint: string;
  /** null se la risposta non è arrivata (timeout, rete). */
  http_status: number | null;
  duration_ms: number;
  attempt: number;
  object_id: string | null;
  error_code: ErrorCode;
  /** Body della risposta del provider, redatto e troncato a 4 KB (o causa dell'errore di rete). */
  provider_response: string;
}

export interface ExternalCallPayloadFields {
  direction: "richiesta" | "risposta";
  provider: string;
  operation: string;
  size_bytes: number;
  body: unknown;
}

export interface DiagnosticModeFields {
  diagnostic_id: string;
  scope_type: DiagnosticScopeType;
  scope_id: string;
  /** Nome leggibile dello scope (slug del negozio, email dello staff, codice della carta). */
  scope_label: string;
  diagnostic_level: "debug" | "trace";
  reason: string;
  enabled_by: string;
  enabled_at: string;
  expires_at: string;
}

export interface DiagnosticModeDisabledFields extends DiagnosticModeFields {
  disabled_by: string;
}

export interface DiagnosticModeReadFailedFields {
  error_message: string;
}

export interface WalletUpdateFailedFields {
  provider: "google" | "apple";
  customer_ref: string;
  error_message: string;
}

/* ------------------------------------------------------------------ */
/* Catalogo                                                            */
/* ------------------------------------------------------------------ */

const startupOk: ServerStartupOkFields = {
  app: "web",
  env: "production",
  version: "0.1.0",
  commit: "a1b2c3d",
  node_version: "24.15.0",
  supabase_host: "abcd.supabase.co",
  google_wallet_enabled: true,
  apple_wallet_enabled: false,
  log_level: "info",
};

const diagnostic: DiagnosticModeFields = {
  diagnostic_id: "5f1c2a9e-0d1b-4f43-9a51-7d1e2b3c4d5e",
  scope_type: "shop",
  scope_id: "11111111-1111-4111-8111-111111111111",
  scope_label: "salone-mario",
  diagnostic_level: "debug",
  reason: "Il titolare segnala timbri che non arrivano sulla carta",
  enabled_by: "enea",
  enabled_at: "2026-11-03T09:00:00.000Z",
  expires_at: "2026-11-04T09:00:00.000Z",
};

export const events = {
  "server.startup.ok": defineEvent<ServerStartupOkFields>({
    level: "info",
    description: "Il server è partito e la configurazione è valida. Riepiloga ambiente, versione e servizi attivi.",
    msg: (f) =>
      `Server ${f.app} avviato in ambiente ${f.env}, versione ${f.version} (commit ${f.commit}), Node ${f.node_version}: ` +
      `database Supabase su ${f.supabase_host}, Google Wallet ${onOff(f.google_wallet_enabled)}, ` +
      `Apple Wallet ${onOff(f.apple_wallet_enabled)}, livello di log ${f.log_level}.`,
    examples: [startupOk, { ...startupOk, env: "development", google_wallet_enabled: false }],
  }),

  "server.startup.failed": defineEvent<ServerStartupFailedFields>({
    level: "error",
    description: "Il server non è partito perché la configurazione non è valida. Elenca le variabili da correggere.",
    msg: (f) =>
      `Avvio del server ${f.app} (ambiente ${f.env}, versione ${f.version}) bloccato: configurazione non valida. ` +
      `Variabili mancanti: ${names(f.missing)}. Variabili con formato errato: ${names(f.invalid)}. ` +
      `Azione: impostarle confrontando apps/${f.app}/.env.example e riavviare.`,
    examples: [
      {
        app: "web",
        env: "production",
        version: "0.1.0",
        error_code: "E_CONFIG_INVALID",
        missing: ["SUPABASE_SERVICE_ROLE_KEY"],
        invalid: ["APP_BASE_URL"],
      },
    ],
  }),

  "http.request.start": defineEvent<HttpRequestStartFields>({
    level: "info",
    description: "Una richiesta API è arrivata al server. Apre il blocco di righe con lo stesso request_id.",
    msg: (f) =>
      f.platform === "sconosciuta"
        ? `Richiesta ${f.method} ${f.route} ricevuta (piattaforma non indicata).`
        : `Richiesta ${f.method} ${f.route} ricevuta da ${f.platform}` +
          `${f.app_version === "n/d" ? "" : ` (app ${f.app_version})`}.`,
    examples: [
      { method: "POST", route: "/api/staff/stamp", platform: "ios", app_version: "1.4.0", ip_hash: "9f2c4e1ab37d5c08" },
      {
        method: "POST",
        route: "/api/enroll",
        platform: "sconosciuta",
        app_version: "n/d",
        ip_hash: "4d1e7a90c2b3f615",
      },
    ],
  }),

  "http.request.end": defineEvent<HttpRequestEndFields>({
    level: "info",
    description:
      "Una richiesta API è terminata. Livello info se riuscita, warn se rifiutata con un errore del catalogo (dati non validi, permessi, carta non trovata…).",
    msg: (f) =>
      f.error_code === null
        ? `${f.method} ${f.route} completata con ${f.status} in ${f.duration_ms} ms.`
        : `${f.method} ${f.route} rifiutata con ${f.status} in ${f.duration_ms} ms: ${f.error_message ?? ""} ` +
          `(${f.error_code}, codice assistenza ${f.support_code}).`,
    examples: [
      {
        method: "POST",
        route: "/api/staff/stamp",
        status: 200,
        duration_ms: 182,
        error_code: null,
        error_message: null,
        support_code: "ERR-7K3QX",
      },
      {
        method: "POST",
        route: "/api/staff/stamp",
        status: 403,
        duration_ms: 48,
        error_code: "E_FORBIDDEN_SHOP",
        error_message: "l'utente 2222… non è abilitato sul negozio 9999…",
        support_code: "ERR-7K3QX",
      },
    ],
  }),

  "http.request.failed": defineEvent<HttpRequestFailedFields>({
    level: "error",
    description:
      "Una richiesta API è fallita per un errore imprevisto (bug o database). La riga contiene lo stack; il cliente ha ricevuto un 500 con il codice assistenza.",
    msg: (f) =>
      `${f.method} ${f.route} fallita con errore imprevisto dopo ${f.duration_ms} ms: ${f.error_message} ` +
      `(${f.error_code}, risposta ${f.status}, codice assistenza ${f.support_code}). ` +
      `Azione: passare lo stack di questa riga allo sviluppo.`,
    examples: [
      {
        method: "POST",
        route: "/api/staff/stamp",
        status: 500,
        duration_ms: 95,
        error_code: "E_DB",
        error_message: 'relation "customers" does not exist',
        support_code: "ERR-7K3QX",
      },
    ],
  }),

  "http.request.payload": defineEvent<HttpRequestPayloadFields>({
    level: "debug",
    description:
      "Solo in modalità diagnostica: body della richiesta o della risposta API, già redatto (niente token, telefono, OTP).",
    msg: (f) => `Payload della ${f.direction} ${f.method} ${f.route} (${bytes(f.size_bytes)}): vedi il campo body.`,
    examples: [
      {
        direction: "richiesta",
        method: "POST",
        route: "/api/staff/stamp",
        size_bytes: 92,
        body: { shopId: "11111111-…", qrToken: "0123…" },
      },
    ],
  }),

  "external.call.ok": defineEvent<ExternalCallOkFields>({
    level: "info",
    description: "Chiamata riuscita a un servizio esterno (Google Wallet, APNs, Twilio, Stripe, Storage…).",
    msg: (f) =>
      `Chiamata a ${f.provider} riuscita: ${f.operation}${f.object_id === null ? "" : ` per ${f.object_id}`} ` +
      `(${f.method} ${f.endpoint}, ${f.http_status}, ${f.duration_ms} ms, tentativo ${f.attempt}).`,
    examples: [
      {
        provider: "google",
        operation: "aggiornamento carta",
        method: "PATCH",
        endpoint: "https://walletobjects.googleapis.com/walletobjects/v1/loyaltyObject/3388.cust-a3f2",
        http_status: 200,
        duration_ms: 341,
        attempt: 1,
        object_id: "3388.cust-a3f2",
      },
      {
        provider: "twilio",
        operation: "invio OTP",
        method: "POST",
        endpoint: "https://verify.twilio.com/v2/Services/VA1/Verifications",
        http_status: 201,
        duration_ms: 512,
        attempt: 1,
        object_id: null,
      },
    ],
  }),

  "external.call.failed": defineEvent<ExternalCallFailedFields>({
    level: "error",
    description:
      "Chiamata fallita a un servizio esterno: status HTTP e risposta del provider (troncata a 4 KB) dicono perché.",
    msg: (f) =>
      `Chiamata a ${f.provider} fallita: ${f.operation}${f.object_id === null ? "" : ` per ${f.object_id}`} ` +
      `(${f.method} ${f.endpoint}, ` +
      `${f.http_status === null ? "nessuna risposta" : `status ${f.http_status}`}, ${f.duration_ms} ms, tentativo ${f.attempt}). ` +
      `Il provider dice: "${f.provider_response.slice(0, 200)}" (${f.error_code}).`,
    examples: [
      {
        provider: "google",
        operation: "aggiornamento carta",
        method: "PATCH",
        endpoint: "https://walletobjects.googleapis.com/walletobjects/v1/loyaltyObject/3388.cust-b71d",
        http_status: 401,
        duration_ms: 212,
        attempt: 1,
        object_id: "3388.cust-b71d",
        error_code: "E_EXTERNAL_HTTP",
        provider_response: "Request had invalid authentication credentials.",
      },
      {
        provider: "twilio",
        operation: "invio OTP",
        method: "POST",
        endpoint: "https://verify.twilio.com/v2/Services/VA1/Verifications",
        http_status: null,
        duration_ms: 10000,
        attempt: 2,
        object_id: null,
        error_code: "E_EXTERNAL_UNAVAILABLE",
        provider_response: "timeout dopo 10000 ms",
      },
    ],
  }),

  "external.call.payload": defineEvent<ExternalCallPayloadFields>({
    level: "debug",
    description: "Solo in modalità diagnostica: payload completo inviato o ricevuto da un servizio esterno, redatto.",
    msg: (f) =>
      `Payload della ${f.direction} a ${f.provider} per ${f.operation} (${bytes(f.size_bytes)}): vedi il campo body.`,
    examples: [
      {
        direction: "richiesta",
        provider: "google",
        operation: "aggiornamento carta",
        size_bytes: 1830,
        body: { loyaltyPoints: { balance: { string: "7 / 10" } } },
      },
    ],
  }),

  "diagnostic.mode.enabled": defineEvent<DiagnosticModeFields>({
    level: "info",
    description:
      "Qualcuno del team ha attivato la modalità diagnostica (log debug/trace con payload) per un negozio, un utente staff o un cliente.",
    msg: (f) =>
      `Modalità diagnostica ${f.diagnostic_level} attivata da ${f.enabled_by} per ${scope(f)} ` +
      `fino al ${when(f.expires_at)}. Motivo: ${f.reason}.`,
    examples: [diagnostic],
  }),

  "diagnostic.mode.disabled": defineEvent<DiagnosticModeDisabledFields>({
    level: "info",
    description: "La modalità diagnostica è stata spenta a mano prima della scadenza.",
    msg: (f) =>
      `Modalità diagnostica per ${scope(f)} disattivata da ${f.disabled_by} prima della scadenza. ` +
      `Era attiva dal ${when(f.enabled_at)}; motivo: ${f.reason}.`,
    examples: [{ ...diagnostic, disabled_by: "enea" }],
  }),

  "diagnostic.mode.expired": defineEvent<DiagnosticModeFields>({
    level: "info",
    description: "La modalità diagnostica è scaduta da sola: da qui in poi i log tornano al livello normale.",
    msg: (f) =>
      `Modalità diagnostica ${f.diagnostic_level} per ${scope(f)} scaduta il ${when(f.expires_at)}: ` +
      `i log tornano al livello normale. Era stata attivata da ${f.enabled_by} il ${when(f.enabled_at)}; motivo: ${f.reason}.`,
    examples: [diagnostic],
  }),

  "diagnostic.mode.read_failed": defineEvent<DiagnosticModeReadFailedFields>({
    level: "warn",
    description:
      "Il server non è riuscito a leggere le modalità diagnostiche attive: i log restano al livello normale finché la lettura non riesce.",
    msg: (f) =>
      `Lettura delle modalità diagnostiche fallita: ${f.error_message}. I log restano al livello normale; ` +
      `nuovo tentativo tra 30 secondi.`,
    examples: [{ error_message: "fetch failed (Supabase non raggiungibile)" }],
  }),

  "wallet.update.failed": defineEvent<WalletUpdateFailedFields>({
    level: "error",
    description:
      "L'aggiornamento della carta su Google o Apple Wallet è fallito. Il timbro o il riscatto è comunque salvato nel database.",
    msg: (f) =>
      `Aggiornamento della carta ${f.customer_ref} su ${f.provider === "google" ? "Google" : "Apple"} Wallet fallito: ` +
      `${f.error_message}. Il dato è salvato nel database ma la carta sul telefono non è allineata. ` +
      `Azione: verificare le credenziali del wallet e risincronizzare la carta.`,
    examples: [
      {
        provider: "google",
        customer_ref: "B71D0E44",
        error_message: "Request failed with status code 401",
      },
    ],
  }),
} as const;

export type EventName = keyof typeof events;
export type EventFields<E extends EventName> = (typeof events)[E] extends EventDef<infer F> ? F : never;
