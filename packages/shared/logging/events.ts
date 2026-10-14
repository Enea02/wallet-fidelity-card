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

const ROLE_LABEL: Record<ActorRole, string> = {
  owner: "titolare",
  operator: "operatore",
  support: "assistenza",
  customer: "cliente",
};
const PLATFORM_LABEL: Record<string, string> = {
  ios: "iOS",
  android: "Android",
  web: "web",
  "public-web": "web pubblico",
};

/** "Giulia (operatore, iOS 1.4.0)"; "il cliente" se ha agito il cliente stesso. */
const actor = (f: ActorFields): string => {
  if (f.actor_role === "customer") return "il cliente";
  const where =
    f.platform === "sconosciuta"
      ? ""
      : `, ${PLATFORM_LABEL[f.platform] ?? f.platform}${f.app_version === "n/d" ? "" : ` ${f.app_version}`}`;
  return `${f.actor_name} (${ROLE_LABEL[f.actor_role]}${where})`;
};
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** "carta A3F2C91B del negozio Salone Mario" (con "del negozio" l'articolo è giusto per qualsiasi nome). */
const card = (f: CardFields) => `carta ${f.customer_ref} del negozio ${f.shop_name}`;
const minutes = (n: number) => (n === 1 ? "1 minuto" : `${n} minuti`);
const ago = (n: number) => (n < 1 ? "meno di un minuto fa" : `${minutes(n)} fa`);

const ROLE_NAME: Record<"owner" | "operator", string> = { owner: "titolare", operator: "operatore" };
const kb = (n: number) => (n < 1024 ? `${n} byte` : `${Math.round(n / 1024)} KB`);

/** Perché Google ha rifiutato, in parole semplici, e cosa fare (per il msg). */
const GOOGLE_REASON: Partial<Record<ErrorCode, [string, string]>> = {
  E_GOOGLE_AUTH: [
    "credenziali del service account rifiutate",
    "verificare la chiave GOOGLE_WALLET_SA_KEY_B64 e il ruolo del service account nella Wallet Console",
  ],
  E_GOOGLE_NOT_FOUND: [
    "carta o template non trovati su Google",
    "risincronizzare il negozio (pnpm wallet:resync --shop)",
  ],
  E_GOOGLE_QUOTA: ["limite di richieste di Google superato", "nessuna, riprova da solo"],
  E_GOOGLE_INVALID_PAYLOAD: ["Google ha rifiutato i dati inviati", "leggere provider_response per il campo rifiutato"],
  E_GOOGLE_UNAVAILABLE: ["Google non risponde", "nessuna, riprova da solo"],
};
const googleWhy = (f: GoogleFailureFields) => {
  const [why] = GOOGLE_REASON[f.error_code] ?? ["errore imprevisto"];
  return `${why} (${f.http_status === null ? "nessuna risposta" : f.http_status})`;
};
const googleNext = (f: GoogleFailureFields) =>
  f.retry_in_min === null ? "tentativi automatici esauriti" : `verrà ritentato tra ${minutes(f.retry_in_min)}`;
/** Con i tentativi esauriti "riprova da solo" non vale più: serve risincronizzare a mano. */
const googleAction = (f: GoogleFailureFields) =>
  f.retry_in_min !== null
    ? (GOOGLE_REASON[f.error_code] ?? ["", "vedi il runbook"])[1]
    : GOOGLE_REASON[f.error_code]?.[1].startsWith("nessuna")
      ? "quando Google torna disponibile, risincronizzare con pnpm wallet:resync"
      : `${GOOGLE_REASON[f.error_code]?.[1] ?? "risolvere la causa"}, poi risincronizzare con pnpm wallet:resync`;
const cardBalance = (f: GoogleCardFields) =>
  `${f.stamps}/${f.stamps_required}, ${f.rewards === 1 ? "1 premio" : `${f.rewards} premi`}`;

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

export type ActorRole = "owner" | "operator" | "support" | "customer";

/** Chi ha fatto l'operazione: nome dello staff (mai del cliente), ruolo, piattaforma e versione dell'app. */
export interface ActorFields {
  actor_name: string;
  actor_role: ActorRole;
  platform: string;
  app_version: string;
}

/** Carta coinvolta: codice breve (mai nome o telefono del cliente) e negozio. */
export interface CardFields {
  customer_ref: string;
  shop_name: string;
}

export interface StampAddOkFields extends ActorFields, CardFields {
  stamps_before: number;
  stamps_after: number;
  stamps_required: number;
  rewards_after: number;
  reward_unlocked: boolean;
}

export interface RewardUnlockedFields extends CardFields {
  stamps_required: number;
  reward_label: string;
  rewards_available: number;
}

export interface StampRejectedCooldownFields extends ActorFields, CardFields {
  error_code: ErrorCode;
  last_stamp_at: string;
  minutes_since: number;
  cooldown_min: number;
  minutes_left: number;
}

export interface StampUndoOkFields extends ActorFields, CardFields {
  stamps_before: number;
  stamps_after: number;
  rewards_before: number;
  rewards_after: number;
  stamps_required: number;
  reward_removed: boolean;
}

export interface StampUndoRejectedFields extends ActorFields, CardFields {
  error_code: ErrorCode;
  /** Perché, in italiano (es. "il timbro è stato dato da Marco"). */
  rejection_reason: string;
}

export interface RewardRedeemOkFields extends ActorFields, CardFields {
  reward_label: string;
  rewards_before: number;
  rewards_after: number;
}

export interface RewardRedeemRejectedFields extends ActorFields, CardFields {
  error_code: ErrorCode;
  stamps: number;
  stamps_required: number;
}

export interface BalanceAdjustOkFields extends ActorFields, CardFields {
  stamps_before: number;
  stamps_after: number;
  rewards_before: number;
  rewards_after: number;
  stamps_required: number;
  reason: string;
}

export interface CustomerDeleteOkFields extends ActorFields, CardFields {
  stamps_at_delete: number;
  rewards_at_delete: number;
  audit_rows_pseudonymized: number;
}

export interface CustomerMarketingChangedFields extends ActorFields, CardFields {
  consent_marketing: boolean;
}

export interface EnrollCustomerCreatedFields extends CardFields {
  platform: string;
  consent_marketing: boolean;
}

export interface EnrollCustomerReturningFields extends CardFields {
  stamps: number;
  stamps_required: number;
  rewards_available: number;
}

export interface AuthTokenInvalidFields {
  route: string;
  /** "scaduto" | "non valido" | "utente inesistente" */
  reason: string;
}

export interface AuthForbiddenShopFields {
  route: string;
  user_id: string;
  shop_id: string;
}

export interface AuthForbiddenRoleFields extends ActorFields {
  route: string;
  shop_name: string;
  required_role: "owner";
}

export interface RateLimitHitFields {
  route: string;
  /** "utente" | "IP" */
  scope: string;
  limit: number;
  window_s: number;
  retry_after_s: number;
}

export interface CustomerLookupFields extends ActorFields {
  shop_name: string;
  /** "QR" | "codice breve" */
  method: string;
}

export interface CustomerLookupOkFields extends CustomerLookupFields {
  customer_ref: string;
  stamps: number;
  stamps_required: number;
  rewards_available: number;
}

export interface CustomerSearchFields extends ActorFields {
  shop_name: string;
  /** "nome" | "telefono" | "codice breve" | "tutti": mai il testo cercato (può essere un telefono) */
  query_kind: string;
  results: number;
}

export interface StatsViewedFields extends ActorFields {
  shop_name: string;
  customers_total: number;
}

export interface SettingsUpdateOkFields extends ActorFields {
  shop_name: string;
  changed_fields: string[];
  /** Riepilogo leggibile: "colore #1f2937 → #7c3aed, timbri richiesti 10 → 8". */
  changes: string;
}

export interface LogoUploadUrlIssuedFields extends ActorFields {
  shop_name: string;
  content_type: string;
  size_bytes: number;
}

export interface StaffInviteSentFields extends ActorFields {
  shop_name: string;
  member_name: string;
  member_email: string;
  member_role: "owner" | "operator";
  existing_account: boolean;
}

export interface StaffRoleChangedFields extends ActorFields {
  shop_name: string;
  member_name: string;
  role_before: "owner" | "operator";
  role_after: "owner" | "operator";
}

export interface StaffRevokedFields extends ActorFields {
  shop_name: string;
  member_name: string;
  member_role: "owner" | "operator";
}

export interface PromoSendQueuedFields extends ActorFields {
  shop_name: string;
  promotion_id: string;
  recipients: number;
  chars: number;
}

export interface CounterQrDownloadedFields extends ActorFields {
  shop_name: string;
  size_bytes: number;
  duration_ms: number;
}

export interface DiagnosticsReceivedFields extends ActorFields {
  shop_name: string;
  ticket_code: string;
  size_bytes: number;
  events_count: number;
}

export type WalletCardState = "ACTIVE" | "INACTIVE";

/** Carta su Google Wallet: cosa è stato inviato. */
export interface GoogleCardFields extends CardFields {
  stamps: number;
  stamps_required: number;
  rewards: number;
  card_state: WalletCardState;
  duration_ms: number;
  attempt: number;
}

/** Dettagli di un errore di Google Wallet. */
export interface GoogleFailureFields {
  http_status: number | null;
  error_code: ErrorCode;
  provider_response: string;
  /** Tra quanti minuti si riprova; null = tentativi esauriti. */
  retry_in_min: number | null;
}

export interface GoogleClassFields {
  shop_name: string;
  class_id: string;
  duration_ms: number;
  attempt: number;
}

export interface GoogleMessageFields extends CardFields {
  /** "premio sbloccato" | "promozione" */
  message_kind: string;
  message_id: string;
  duration_ms: number;
  attempt: number;
}

export interface WalletRetryScheduledFields {
  /** "carta" | "template del negozio" | "messaggio" */
  target_kind: string;
  /** Codice breve della carta o nome del negozio. */
  target: string;
  next_attempt: number;
  retry_in_min: number;
  retry_at: string;
  error_code: ErrorCode;
}

export interface WalletRetryExhaustedFields {
  target_kind: string;
  target: string;
  attempts: number;
  error_code: ErrorCode;
  last_error: string;
}

export interface WalletCardDeactivatedFields extends CardFields {
  /** "cliente cancellato" | "negozio sospeso" */
  reason: string;
}

export interface WalletSyncReconciledFields extends CardFields {
  /** "saldo" | "stato" | "impostazioni del negozio" | "mai sincronizzata" */
  reason: string;
}

export interface PromoSendCompletedFields {
  shop_name: string;
  promotion_id: string;
  sent: number;
  skipped: number;
  failed: number;
}

export interface CronWalletSyncRunFields {
  retries: number;
  retries_ok: number;
  reconciled: number;
  promo_sent: number;
  promo_failed: number;
  duration_ms: number;
}

export interface WalletSyncUnexpectedErrorFields {
  /** Cosa si stava facendo: "sincronizzazione carta", "notifica premio"… */
  task: string;
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

const giulia: ActorFields = { actor_name: "Giulia", actor_role: "operator", platform: "ios", app_version: "1.4.0" };
const titolare: ActorFields = { actor_name: "Mario", actor_role: "owner", platform: "web", app_version: "n/d" };
const cardA: CardFields = { customer_ref: "A3F2C91B", shop_name: "Salone Mario" };

const googleOk: GoogleCardFields = {
  ...cardA,
  stamps: 7,
  stamps_required: 10,
  rewards: 0,
  card_state: "ACTIVE",
  duration_ms: 341,
  attempt: 1,
};
const google401: GoogleFailureFields = {
  http_status: 401,
  error_code: "E_GOOGLE_AUTH",
  provider_response: "Request had invalid authentication credentials.",
  retry_in_min: 5,
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

  "enroll.customer.created": defineEvent<EnrollCustomerCreatedFields>({
    level: "info",
    description: "Un nuovo cliente si è iscritto: carta creata con il suo codice breve.",
    msg: (f) =>
      `Nuovo cliente iscritto al negozio ${f.shop_name}${f.platform === "sconosciuta" ? "" : ` da ${PLATFORM_LABEL[f.platform] ?? f.platform}`}: ` +
      `carta ${f.customer_ref} creata (consenso marketing: ${f.consent_marketing ? "sì" : "no"}).`,
    examples: [{ ...cardA, platform: "public-web", consent_marketing: true }],
  }),

  "enroll.customer.returning": defineEvent<EnrollCustomerReturningFields>({
    level: "info",
    description: "Un cliente già iscritto ha rifatto l'iscrizione con lo stesso telefono: ritrova la stessa carta.",
    msg: (f) =>
      `Cliente già iscritto al negozio ${f.shop_name} ha ritrovato la sua carta ${f.customer_ref} ` +
      `(${f.stamps}/${f.stamps_required} timbri, premi disponibili: ${f.rewards_available}).`,
    examples: [{ ...cardA, stamps: 6, stamps_required: 10, rewards_available: 0 }],
  }),

  "stamp.add.ok": defineEvent<StampAddOkFields>({
    level: "info",
    description: "Un membro dello staff ha aggiunto un timbro a una carta.",
    msg: (f) =>
      f.reward_unlocked
        ? `${cap(actor(f))} ha aggiunto un timbro alla ${card(f)}: ${f.stamps_before} → ${f.stamps_required} su ${f.stamps_required}, ` +
          `carta completata e premio sbloccato (premi disponibili: ${f.rewards_after}).`
        : `${cap(actor(f))} ha aggiunto un timbro alla ${card(f)}: ${f.stamps_before} → ${f.stamps_after} su ${f.stamps_required}.`,
    examples: [
      {
        ...giulia,
        ...cardA,
        stamps_before: 6,
        stamps_after: 7,
        stamps_required: 10,
        rewards_after: 0,
        reward_unlocked: false,
      },
      {
        ...giulia,
        ...cardA,
        stamps_before: 9,
        stamps_after: 0,
        stamps_required: 10,
        rewards_after: 1,
        reward_unlocked: true,
      },
    ],
  }),

  "stamp.add.rejected_cooldown": defineEvent<StampRejectedCooldownFields>({
    level: "warn",
    description:
      "Timbro rifiutato perché troppo vicino al precedente (tempo minimo tra due timbri impostato dal negozio).",
    msg: (f) =>
      `Timbro di ${actor(f)} rifiutato sulla ${card(f)}: ultimo timbro ${ago(f.minutes_since)}, ` +
      `il negozio richiede almeno ${minutes(f.cooldown_min)} tra due timbri (mancano ${minutes(f.minutes_left)}).`,
    examples: [
      {
        ...giulia,
        ...cardA,
        error_code: "E_STAMP_COOLDOWN",
        last_stamp_at: "2026-11-03T09:32:14.000Z",
        minutes_since: 8,
        cooldown_min: 60,
        minutes_left: 52,
      },
    ],
  }),

  "reward.unlocked": defineEvent<RewardUnlockedFields>({
    level: "info",
    description: "Una carta ha raggiunto i timbri richiesti: il premio è disponibile.",
    msg: (f) =>
      `La ${card(f)} ha raggiunto ${f.stamps_required} timbri: ` +
      `premio "${f.reward_label}" sbloccato (premi disponibili: ${f.rewards_available}).`,
    examples: [{ ...cardA, stamps_required: 10, reward_label: "Taglio gratis", rewards_available: 1 }],
  }),

  "stamp.undo.ok": defineEvent<StampUndoOkFields>({
    level: "info",
    description: "Un membro dello staff ha annullato l'ultimo timbro che aveva dato (entro 5 minuti).",
    msg: (f) =>
      `${cap(actor(f))} ha annullato l'ultimo timbro della ${card(f)}: ` +
      (f.reward_removed
        ? `il premio sbloccato da quel timbro è stato tolto, timbri tornati a ${f.stamps_after} su ${f.stamps_required} ` +
          `(premi disponibili: ${f.rewards_before} → ${f.rewards_after}).`
        : `${f.stamps_before} → ${f.stamps_after} su ${f.stamps_required}.`),
    examples: [
      {
        ...giulia,
        ...cardA,
        stamps_before: 7,
        stamps_after: 6,
        rewards_before: 0,
        rewards_after: 0,
        stamps_required: 10,
        reward_removed: false,
      },
      {
        ...giulia,
        ...cardA,
        stamps_before: 0,
        stamps_after: 9,
        rewards_before: 1,
        rewards_after: 0,
        stamps_required: 10,
        reward_removed: true,
      },
    ],
  }),

  "stamp.undo.rejected": defineEvent<StampUndoRejectedFields>({
    level: "warn",
    description: "Annullamento dell'ultimo timbro rifiutato: tempo scaduto, altro operatore, carta già modificata.",
    msg: (f) =>
      `Annullamento dell'ultimo timbro chiesto da ${actor(f)} sulla ${card(f)} rifiutato: ${f.rejection_reason}.`,
    examples: [
      {
        ...giulia,
        ...cardA,
        error_code: "E_UNDO_EXPIRED",
        rejection_reason: "il timbro è stato dato 12 minuti fa (limite 5 minuti)",
      },
      { ...giulia, ...cardA, error_code: "E_UNDO_OTHER_OPERATOR", rejection_reason: "il timbro è stato dato da Marco" },
    ],
  }),

  "reward.redeem.ok": defineEvent<RewardRedeemOkFields>({
    level: "info",
    description: "Un membro dello staff ha riscattato un premio dalla carta del cliente.",
    msg: (f) =>
      `${cap(actor(f))} ha riscattato il premio "${f.reward_label}" dalla ${card(f)} ` +
      `(premi disponibili: ${f.rewards_before} → ${f.rewards_after}).`,
    examples: [{ ...giulia, ...cardA, reward_label: "Taglio gratis", rewards_before: 1, rewards_after: 0 }],
  }),

  "reward.redeem.rejected_none": defineEvent<RewardRedeemRejectedFields>({
    level: "warn",
    description: "Riscatto rifiutato perché la carta non ha premi disponibili.",
    msg: (f) =>
      `Riscatto chiesto da ${actor(f)} sulla ${card(f)} rifiutato: nessun premio disponibile ` +
      `(la carta ha ${f.stamps}/${f.stamps_required} timbri).`,
    examples: [{ ...giulia, ...cardA, error_code: "E_NO_REWARD", stamps: 4, stamps_required: 10 }],
  }),

  "balance.adjust.ok": defineEvent<BalanceAdjustOkFields>({
    level: "info",
    description: "Il titolare ha corretto a mano timbri e premi di una carta, indicando il motivo.",
    msg: (f) =>
      `${cap(actor(f))} ha rettificato la ${card(f)}: timbri ${f.stamps_before} → ${f.stamps_after} su ${f.stamps_required}, ` +
      `premi ${f.rewards_before} → ${f.rewards_after}. Motivo: ${f.reason}.`,
    examples: [
      {
        ...titolare,
        ...cardA,
        stamps_before: 3,
        stamps_after: 5,
        rewards_before: 0,
        rewards_after: 0,
        stamps_required: 10,
        reason: "timbri della carta cartacea",
      },
    ],
  }),

  "customer.delete.ok": defineEvent<CustomerDeleteOkFields>({
    level: "info",
    description:
      "Cliente cancellato su richiesta: dati personali rimossi, storico pseudonimizzato, la carta non è più utilizzabile.",
    msg: (f) =>
      `${cap(actor(f))} ha cancellato il cliente della ${card(f)}: nome, telefono e consensi rimossi, ` +
      `${f.audit_rows_pseudonymized} righe di storico pseudonimizzate (la carta aveva ${f.stamps_at_delete} timbri e ${f.rewards_at_delete} premi).`,
    examples: [
      { ...titolare, ...cardA, stamps_at_delete: 4, rewards_at_delete: 0, audit_rows_pseudonymized: 7 },
      {
        actor_name: "assistenza",
        actor_role: "support",
        platform: "sconosciuta",
        app_version: "n/d",
        ...cardA,
        stamps_at_delete: 0,
        rewards_at_delete: 1,
        audit_rows_pseudonymized: 12,
      },
    ],
  }),

  "customer.marketing.changed": defineEvent<CustomerMarketingChangedFields>({
    level: "info",
    description: "Il consenso alle promozioni di un cliente è cambiato (dal titolare o dal cliente con il link).",
    msg: (f) =>
      `${cap(actor(f))} ha ${f.consent_marketing ? "attivato" : "revocato"} il consenso alle promozioni per la ${card(f)}.`,
    examples: [
      { ...titolare, ...cardA, consent_marketing: false },
      {
        actor_name: "cliente",
        actor_role: "customer",
        platform: "public-web",
        app_version: "n/d",
        ...cardA,
        consent_marketing: false,
      },
    ],
  }),

  "auth.token.invalid": defineEvent<AuthTokenInvalidFields>({
    level: "warn",
    description:
      "Richiesta all'API esercente con un token di accesso scaduto o non valido: l'app deve far rifare il login.",
    msg: (f) => `Accesso rifiutato a ${f.route}: token ${f.reason}. L'utente deve rifare il login.`,
    examples: [{ route: "/api/v1/merchant/stamp", reason: "scaduto" }],
  }),

  "auth.forbidden.shop": defineEvent<AuthForbiddenShopFields>({
    level: "warn",
    description: "Un utente autenticato ha chiesto dati o operazioni di un negozio a cui non appartiene.",
    msg: (f) => `Accesso a ${f.route} negato: l'utente ${f.user_id} non fa parte dello staff del negozio ${f.shop_id}.`,
    examples: [
      {
        route: "/api/v1/merchant/customers",
        user_id: "55555555-5555-4555-8555-555555555555",
        shop_id: "99999999-9999-4999-8999-999999999999",
      },
    ],
  }),

  "auth.forbidden.role": defineEvent<AuthForbiddenRoleFields>({
    level: "warn",
    description: "Un operatore ha chiesto una funzione riservata al titolare.",
    msg: (f) => `${cap(actor(f))} ha chiesto ${f.route} del negozio ${f.shop_name}, riservata al titolare: negato.`,
    examples: [{ ...giulia, route: "/api/v1/merchant/stats", shop_name: "Salone Mario", required_role: "owner" }],
  }),

  "ratelimit.hit": defineEvent<RateLimitHitFields>({
    level: "warn",
    description: "Superato il limite di richieste al minuto (per utente o per IP): la richiesta è stata rifiutata.",
    msg: (f) =>
      `Troppe richieste a ${f.route} dallo stesso ${f.scope}: superato il limite di ${f.limit} in ${f.window_s} secondi. ` +
      `Richiesta rifiutata, si può riprovare tra ${f.retry_after_s} secondi.`,
    examples: [{ route: "/api/v1/merchant/scan/lookup", scope: "utente", limit: 120, window_s: 60, retry_after_s: 34 }],
  }),

  "customer.lookup.ok": defineEvent<CustomerLookupOkFields>({
    level: "info",
    description: "Lo staff ha trovato una carta (scansione del QR o codice breve digitato).",
    msg: (f) =>
      `${cap(actor(f))} ha aperto la carta ${f.customer_ref} del negozio ${f.shop_name} con ${f.method === "QR" ? "la scansione del QR" : "il codice breve"} ` +
      `(${f.stamps}/${f.stamps_required} timbri, premi disponibili: ${f.rewards_available}).`,
    examples: [
      {
        ...giulia,
        shop_name: "Salone Mario",
        method: "QR",
        customer_ref: "A3F2C91B",
        stamps: 6,
        stamps_required: 10,
        rewards_available: 0,
      },
    ],
  }),

  "customer.lookup.not_found": defineEvent<CustomerLookupFields>({
    level: "warn",
    description: "Scansione o codice breve che non corrisponde a nessuna carta.",
    msg: (f) =>
      `${cap(actor(f))} ha cercato una carta nel negozio ${f.shop_name} con ${f.method === "QR" ? "un QR" : "un codice breve"} ` +
      `che non corrisponde a nessuna carta: QR non nostro, letto male o codice digitato male.`,
    examples: [{ ...giulia, shop_name: "Salone Mario", method: "codice breve" }],
  }),

  "customer.lookup.other_shop": defineEvent<CustomerLookupFields>({
    level: "warn",
    description: "Scansione di una carta valida ma di un altro negozio.",
    msg: (f) =>
      `${cap(actor(f))} ha scansionato nel negozio ${f.shop_name} una carta che appartiene a un altro negozio: ` +
      `il cliente ha mostrato la carta sbagliata o l'app ha selezionato il negozio sbagliato.`,
    examples: [{ ...giulia, shop_name: "Salone Mario", method: "QR" }],
  }),

  "customer.search": defineEvent<CustomerSearchFields>({
    level: "info",
    description: "Il titolare ha consultato o cercato nella lista clienti (il testo cercato non viene registrato).",
    msg: (f) =>
      f.query_kind === "tutti"
        ? `${cap(actor(f))} ha consultato la lista clienti del negozio ${f.shop_name} (${f.results} risultati).`
        : `${cap(actor(f))} ha cercato tra i clienti del negozio ${f.shop_name} per ${f.query_kind} (${f.results} risultati).`,
    examples: [
      { ...titolare, shop_name: "Salone Mario", query_kind: "telefono", results: 1 },
      { ...titolare, shop_name: "Salone Mario", query_kind: "tutti", results: 25 },
    ],
  }),

  "stats.viewed": defineEvent<StatsViewedFields>({
    level: "info",
    description: "Il titolare ha aperto la dashboard con le statistiche del negozio.",
    msg: (f) =>
      `${cap(actor(f))} ha aperto le statistiche del negozio ${f.shop_name} (${f.customers_total} clienti iscritti).`,
    examples: [{ ...titolare, shop_name: "Salone Mario", customers_total: 148 }],
  }),

  "settings.update.ok": defineEvent<SettingsUpdateOkFields>({
    level: "info",
    description: "Il titolare ha modificato le impostazioni del negozio o della carta.",
    msg: (f) => `${cap(actor(f))} ha aggiornato le impostazioni del negozio ${f.shop_name}: ${f.changes}.`,
    examples: [
      {
        ...titolare,
        shop_name: "Salone Mario",
        changed_fields: ["hex_color", "stamps_required"],
        changes: "colore #1f2937 → #7c3aed, timbri richiesti 10 → 8",
      },
    ],
  }),

  "logo.upload_url.issued": defineEvent<LogoUploadUrlIssuedFields>({
    level: "info",
    description: "Il titolare ha chiesto di caricare un nuovo logo: rilasciato un URL di caricamento firmato.",
    msg: (f) =>
      `${cap(actor(f))} sta caricando un nuovo logo per il negozio ${f.shop_name} (${f.content_type}, ${kb(f.size_bytes)}): ` +
      `URL di caricamento rilasciato.`,
    examples: [{ ...titolare, shop_name: "Salone Mario", content_type: "image/png", size_bytes: 184_320 }],
  }),

  "staff.invite.sent": defineEvent<StaffInviteSentFields>({
    level: "info",
    description: "Il titolare ha aggiunto una persona allo staff (con email d'invito se non aveva già un account).",
    msg: (f) =>
      `${cap(actor(f))} ha aggiunto ${f.member_name} (${f.member_email}) allo staff del negozio ${f.shop_name} come ${ROLE_NAME[f.member_role]}` +
      (f.existing_account ? ": aveva già un account, nessuna email inviata." : ": inviata l'email d'invito."),
    examples: [
      {
        ...titolare,
        shop_name: "Salone Mario",
        member_name: "Giulia",
        member_email: "gi***@salone.it",
        member_role: "operator",
        existing_account: false,
      },
    ],
  }),

  "staff.role.changed": defineEvent<StaffRoleChangedFields>({
    level: "info",
    description: "Il titolare ha cambiato il ruolo (o il nome) di un membro dello staff.",
    msg: (f) =>
      f.role_before === f.role_after
        ? `${cap(actor(f))} ha modificato i dati di ${f.member_name} nello staff del negozio ${f.shop_name} (ruolo invariato: ${ROLE_NAME[f.role_after]}).`
        : `${cap(actor(f))} ha cambiato il ruolo di ${f.member_name} nel negozio ${f.shop_name}: ${ROLE_NAME[f.role_before]} → ${ROLE_NAME[f.role_after]}.`,
    examples: [
      { ...titolare, shop_name: "Salone Mario", member_name: "Giulia", role_before: "operator", role_after: "owner" },
    ],
  }),

  "staff.revoked": defineEvent<StaffRevokedFields>({
    level: "info",
    description: "Il titolare ha rimosso una persona dallo staff: non può più accedere al negozio.",
    msg: (f) =>
      `${cap(actor(f))} ha rimosso ${f.member_name} (${ROLE_NAME[f.member_role]}) dallo staff del negozio ${f.shop_name}.`,
    examples: [{ ...titolare, shop_name: "Salone Mario", member_name: "Giulia", member_role: "operator" }],
  }),

  "promo.send.queued": defineEvent<PromoSendQueuedFields>({
    level: "info",
    description: "Il titolare ha prenotato l'invio di una promozione ai clienti con consenso marketing.",
    msg: (f) =>
      `${cap(actor(f))} ha prenotato una promozione del negozio ${f.shop_name} (${f.chars} caratteri) ` +
      `per ${f.recipients} clienti con consenso marketing.`,
    examples: [
      {
        ...titolare,
        shop_name: "Salone Mario",
        promotion_id: "7d1e2b3c-4d5e-4f43-9a51-5f1c2a9e0d1b",
        recipients: 42,
        chars: 96,
      },
    ],
  }),

  "counter_qr.downloaded": defineEvent<CounterQrDownloadedFields>({
    level: "info",
    description: "Il titolare ha scaricato il PDF del cartello A5 con il QR di iscrizione.",
    msg: (f) =>
      `${cap(actor(f))} ha scaricato il cartello A5 del negozio ${f.shop_name} (PDF di ${kb(f.size_bytes)}, generato in ${f.duration_ms} ms).`,
    examples: [{ ...titolare, shop_name: "Salone Mario", size_bytes: 48_000, duration_ms: 420 }],
  }),

  "diagnostics.received": defineEvent<DiagnosticsReceivedFields>({
    level: "info",
    description: "L'app ha inviato il pacchetto \"Invia diagnostica all'assistenza\": cercarlo per codice ticket.",
    msg: (f) =>
      `${cap(actor(f))} ha inviato la diagnostica dell'app per il negozio ${f.shop_name}: ticket ${f.ticket_code} ` +
      `(${f.events_count} eventi, ${kb(f.size_bytes)}).`,
    examples: [
      { ...giulia, shop_name: "Salone Mario", ticket_code: "DIAG-7K3QXA2M", size_bytes: 38_000, events_count: 412 },
    ],
  }),

  "wallet.google.class.upsert.ok": defineEvent<GoogleClassFields>({
    level: "info",
    description:
      "Template del programma fedeltà del negozio creato o aggiornato su Google Wallet (nome, colore, logo).",
    msg: (f) => `Template Google Wallet del negozio ${f.shop_name} aggiornato (${f.class_id}) in ${f.duration_ms} ms.`,
    examples: [
      { shop_name: "Salone Mario", class_id: "3388000000022.shop-salone-mario", duration_ms: 290, attempt: 1 },
    ],
  }),

  "wallet.google.class.upsert.failed": defineEvent<GoogleClassFields & GoogleFailureFields>({
    level: "error",
    description: "Creazione o aggiornamento del template del negozio su Google Wallet fallito.",
    msg: (f) =>
      `Aggiornamento del template Google Wallet del negozio ${f.shop_name} fallito: ${googleWhy(f)}; ${googleNext(f)}. ` +
      `Azione: ${googleAction(f)}.`,
    examples: [
      {
        shop_name: "Salone Mario",
        class_id: "3388000000022.shop-salone-mario",
        duration_ms: 120,
        attempt: 1,
        ...google401,
      },
    ],
  }),

  "wallet.google.object.upsert.ok": defineEvent<GoogleCardFields>({
    level: "info",
    description: "Carta del cliente creata su Google Wallet (prima volta, o ricreata perché mancante).",
    msg: (f) =>
      `Carta ${f.customer_ref} del negozio ${f.shop_name} creata su Google Wallet (${cardBalance(f)}) in ${f.duration_ms} ms.`,
    examples: [{ ...googleOk, stamps: 0 }],
  }),

  "wallet.google.object.upsert.failed": defineEvent<GoogleCardFields & GoogleFailureFields>({
    level: "error",
    description: "Creazione della carta del cliente su Google Wallet fallita.",
    msg: (f) =>
      `Creazione su Google Wallet fallita per la carta ${f.customer_ref}: ${googleWhy(f)}. Il cliente è iscritto e ` +
      `può comunque salvare la carta dal link; ${googleNext(f)}. Azione: ${googleAction(f)}.`,
    examples: [{ ...googleOk, stamps: 0, ...google401 }],
  }),

  "wallet.google.patch.ok": defineEvent<GoogleCardFields>({
    level: "info",
    description: "Carta del cliente aggiornata su Google Wallet: Google la propaga da solo al telefono.",
    msg: (f) =>
      f.card_state === "INACTIVE"
        ? `Carta ${f.customer_ref} disattivata su Google Wallet in ${f.duration_ms} ms.`
        : `Carta ${f.customer_ref} aggiornata su Google Wallet (${cardBalance(f)}) in ${f.duration_ms} ms.`,
    examples: [googleOk, { ...googleOk, card_state: "INACTIVE" }],
  }),

  "wallet.google.patch.failed": defineEvent<GoogleCardFields & GoogleFailureFields>({
    level: "error",
    description:
      "Aggiornamento della carta su Google Wallet fallito. Il dato (timbro, premio…) è salvato nel database; la carta sul telefono resta indietro finché un tentativo non riesce.",
    msg: (f) =>
      `Aggiornamento su Google Wallet fallito per la carta ${f.customer_ref}: ${googleWhy(f)}. Il dato è salvato; ` +
      `${googleNext(f)}. Azione: ${googleAction(f)}.`,
    examples: [
      { ...googleOk, ...google401 },
      { ...googleOk, ...google401, attempt: 5, retry_in_min: null },
    ],
  }),

  "wallet.google.message.sent": defineEvent<GoogleMessageFields>({
    level: "info",
    description: "Messaggio con notifica inviato a una carta su Google Wallet (premio sbloccato o promozione).",
    msg: (f) =>
      `Notifica "${f.message_kind}" inviata alla carta ${f.customer_ref} del negozio ${f.shop_name} su Google Wallet in ${f.duration_ms} ms.`,
    examples: [{ ...cardA, message_kind: "premio sbloccato", message_id: "reward-1842", duration_ms: 280, attempt: 1 }],
  }),

  "wallet.google.message.failed": defineEvent<GoogleMessageFields & GoogleFailureFields>({
    level: "error",
    description: "Invio di un messaggio a una carta su Google Wallet fallito.",
    msg: (f) =>
      `Notifica "${f.message_kind}" non inviata alla carta ${f.customer_ref}: ${googleWhy(f)}; ${googleNext(f)}. Azione: ${googleAction(f)}.`,
    examples: [
      { ...cardA, message_kind: "promozione", message_id: "promo-7d1e", duration_ms: 140, attempt: 1, ...google401 },
    ],
  }),

  "wallet.sync.retry.scheduled": defineEvent<WalletRetryScheduledFields>({
    level: "info",
    description: "Pianificato un nuovo tentativo automatico verso il wallet (backoff 1, 5, 15, 60 minuti).",
    msg: (f) =>
      `Nuovo tentativo n. ${f.next_attempt} per ${f.target_kind} ${f.target} su Google Wallet tra ${minutes(f.retry_in_min)} ` +
      `(${when(f.retry_at)}), dopo l'errore ${f.error_code}.`,
    examples: [
      {
        target_kind: "carta",
        target: "B71D0E44",
        next_attempt: 2,
        retry_in_min: 1,
        retry_at: "2026-11-03T10:06:44.000Z",
        error_code: "E_GOOGLE_AUTH",
      },
    ],
  }),

  "wallet.sync.retry.exhausted": defineEvent<WalletRetryExhaustedFields>({
    level: "error",
    description:
      "Esauriti i tentativi automatici verso il wallet: la carta (o il template) resta disallineata finché non si risincronizza a mano.",
    msg: (f) =>
      `Tentativi esauriti per ${f.target_kind} ${f.target} su Google Wallet dopo ${f.attempts} errori (ultimo ${f.error_code}: ${f.last_error}). ` +
      `Azione: risolvere la causa e risincronizzare con pnpm wallet:resync.`,
    examples: [
      { target_kind: "carta", target: "B71D0E44", attempts: 5, error_code: "E_GOOGLE_AUTH", last_error: "status 401" },
    ],
  }),

  "wallet.card.deactivated": defineEvent<WalletCardDeactivatedFields>({
    level: "info",
    description: "Carta resa non utilizzabile su Google Wallet (stato INACTIVE): cliente cancellato o negozio sospeso.",
    msg: (f) => `Carta ${f.customer_ref} del negozio ${f.shop_name} disattivata su Google Wallet: ${f.reason}.`,
    examples: [{ ...cardA, reason: "cliente cancellato" }],
  }),

  "wallet.sync.reconciled": defineEvent<WalletSyncReconciledFields>({
    level: "info",
    description: "La riconciliazione periodica ha trovato una carta non allineata al database e l'ha riallineata.",
    msg: (f) =>
      `Carta ${f.customer_ref} del negozio ${f.shop_name} riallineata su Google Wallet dalla riconciliazione (differenza: ${f.reason}).`,
    examples: [{ ...cardA, reason: "saldo" }],
  }),

  "wallet.sync.unexpected_error": defineEvent<WalletSyncUnexpectedErrorFields>({
    level: "error",
    description:
      "Errore imprevisto (non di Google) durante un lavoro verso i wallet: la riga contiene lo stack. La carta verrà riallineata dalla riconciliazione.",
    msg: (f) =>
      `Errore imprevisto durante ${f.task} verso i wallet: ${f.error_message}. La carta verrà riallineata dalla riconciliazione; ` +
      `azione: passare lo stack di questa riga allo sviluppo.`,
    examples: [{ task: "sincronizzazione carta", error_message: "fetch failed (Supabase non raggiungibile)" }],
  }),

  "promo.send.completed": defineEvent<PromoSendCompletedFields>({
    level: "info",
    description: "Invio di una promozione completato: quanti clienti l'hanno ricevuta, saltati e falliti.",
    msg: (f) =>
      `Promozione del negozio ${f.shop_name} inviata: ${f.sent} consegnate, ${f.skipped} saltate (consenso revocato o carta non disponibile), ${f.failed} fallite.`,
    examples: [
      {
        shop_name: "Salone Mario",
        promotion_id: "7d1e2b3c-4d5e-4f43-9a51-5f1c2a9e0d1b",
        sent: 40,
        skipped: 2,
        failed: 0,
      },
    ],
  }),

  "cron.wallet_sync.run": defineEvent<CronWalletSyncRunFields>({
    level: "info",
    description: "Esecuzione del cron dei wallet (ogni minuto): nuovi tentativi, riconciliazione, invio promozioni.",
    msg: (f) =>
      `Cron wallet completato in ${f.duration_ms} ms: ${f.retries_ok}/${f.retries} tentativi riusciti, ${f.reconciled} carte riallineate, ` +
      `${f.promo_sent} promozioni consegnate, ${f.promo_failed} fallite.`,
    examples: [{ retries: 3, retries_ok: 2, reconciled: 1, promo_sent: 40, promo_failed: 0, duration_ms: 2140 }],
  }),
} as const;

export type EventName = keyof typeof events;
export type EventFields<E extends EventName> = (typeof events)[E] extends EventDef<infer F> ? F : never;
