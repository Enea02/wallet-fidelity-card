/**
 * Catalogo degli eventi di log. Si possono loggare SOLO eventi presenti qui
 * (lo impone il tipo di `log.event`). Nome stabile `dominio.oggetto.azione[.esito]`,
 * livello di default, campi strutturati tipizzati e template del `msg` in italiano:
 * una frase completa che dice chi ha fatto cosa, su cosa, con che esito e, se è fallito,
 * perché e cosa fare. I campi standard (request_id, shop_id, user_id, …) li aggiunge il logger.
 */
import type { ErrorCode } from "../errors";
import { maskEmail } from "../logger/redact";

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

const WALLET_LABEL: Record<string, string> = {
  google: "il pulsante Aggiungi a Google Wallet",
  "apple-in-arrivo": "il QR da mostrare in cassa (Apple Wallet in arrivo)",
  "qr-da-computer": "il QR per aprire la carta dal telefono",
};

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

export interface StampForcedFields extends ActorFields, CardFields {
  stamps_before: number;
  stamps_after: number;
  stamps_required: number;
  cooldown_min: number;
  minutes_left: number;
  last_stamp_at: string;
}

/** Seconda richiesta con la stessa chiave di idempotenza (doppio tocco, rete che ripete). */
export interface DuplicateIgnoredFields extends ActorFields, CardFields {
  original_at: string;
  seconds_since: number;
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

export interface LogoUploadOkFields extends ActorFields {
  shop_name: string;
  content_type: string;
  size_bytes: number;
}

/** Caricamento del logo non riuscito: verso lo Storage (dall'app) o alla verifica (dal server). */
export interface LogoUploadFailedFields {
  shop_name: string;
  stage: "caricamento" | "verifica";
  reason: string;
  http_status: number | null;
}

export interface StaffInviteResentFields extends ActorFields {
  shop_name: string;
  member_name: string;
  member_email: string;
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

export interface EnrollFunnelFields {
  enrollment_id: string;
  shop_name: string;
}

export interface EnrollFormSubmittedFields {
  shop_name: string;
  /** Mascherato automaticamente nei log: +39 333 ***4567. */
  phone: string;
  consent_marketing: boolean;
  platform: string;
}

export interface EnrollCaptchaFailedFields {
  shop_name: string;
  /** Codici d'errore di Turnstile (es. timeout-or-duplicate). */
  reason: string;
}

export interface EnrollOtpSentFields extends EnrollFunnelFields {
  phone: string;
  /** 1 = primo SMS, 2+ = nuovo codice chiesto dal cliente. */
  send_number: number;
  duration_ms: number;
}

export interface EnrollOtpSendFailedFields extends EnrollFunnelFields {
  http_status: number | null;
  error_code: ErrorCode;
  provider_response: string;
  duration_ms: number;
}

export interface EnrollOtpLimitedFields {
  shop_name: string;
  /** "numero" | "numero (giornaliero)" | "IP" | "numero bloccato" */
  scope: string;
  retry_after_min: number;
}

export interface EnrollOtpVerifiedFields extends EnrollFunnelFields {
  attempts: number;
}

export interface EnrollOtpWrongCodeFields extends EnrollFunnelFields {
  attempts_left: number;
}

export interface EnrollOtpBlockedFields extends EnrollFunnelFields {
  blocked_min: number;
}

export interface EnrollWalletLinkFields extends EnrollFunnelFields {
  customer_ref: string;
  /** "google" | "apple-in-arrivo" | "qr-da-computer" */
  wallet: string;
}

export interface EnrollShopUnavailableFields {
  slug: string;
  /** "inesistente" | "sospeso" */
  reason: string;
}

export interface MarketingUnsubscribeFields extends CardFields {
  already_unsubscribed: boolean;
}

export interface CounterQrPublicFields {
  shop_name: string;
  size_bytes: number;
  duration_ms: number;
}

export interface PublicLinkInvalidFields {
  /** "carta" (link breve dal computer) | "disiscrizione" */
  link_kind: string;
  /** "firma non valida" | "scaduto" | "carta cancellata" | "negozio non attivo" */
  reason: string;
}

/* --- App esercente (eventi del client: buffer locale e Sentry) --- */

export type AppPlatform = "ios" | "android" | "web";

export interface AppStartFields {
  platform: AppPlatform;
  app_version: string;
  build: string;
  /** Modello del dispositivo o browser, es. "iPhone 15" o "Chrome 141 su macOS". */
  device: string;
  os_version: string;
}

export interface AppLoginOkFields {
  /** Email dello staff: nel msg e nella riga compare sempre mascherata. */
  email: string;
  shops_count: number;
}

export interface AppLoginFailedFields {
  email: string;
  error_code: ErrorCode;
  /** Motivo tecnico restituito da Supabase Auth (senza dati personali). */
  reason: string;
}

export interface AppLogoutFields {
  reason: "manuale" | "sessione scaduta";
}

export interface AppShopSelectedFields {
  shop_name: string;
  role: "owner" | "operator";
  how: "unico negozio" | "scelta" | "cambio" | "ricordato";
}

export interface AppApiErrorFields {
  request_id: string;
  method: string;
  endpoint: string;
  /** null se il server non ha risposto (rete, timeout). */
  http_status: number | null;
  error_code: ErrorCode | string;
  support_code: string;
  duration_ms: number;
}

export interface AppOnlineFields {
  offline_s: number;
}

export interface AppDiagnosticsSentFields {
  ticket_code: string;
  events_count: number;
  size_bytes: number;
}

export interface AppEmailFields {
  email: string;
}

export type ScanMode = "fotocamera" | "lettore" | "manuale";
const SCAN_MODE_LABEL: Record<ScanMode, string> = {
  fotocamera: "fotocamera",
  lettore: "lettore QR esterno",
  manuale: "codice digitato a mano",
};

export interface ScanReadOkFields {
  mode: ScanMode;
  kind: "QR" | "codice breve";
}

export interface ScanReadInvalidFields {
  mode: ScanMode;
  /** Cosa è stato letto, in breve e senza dati: "testo di 12 caratteri", "URL". */
  reason: string;
}

export interface ScanCameraDeniedFields {
  can_ask_again: boolean;
}

export interface ScanModeChangedFields {
  from: ScanMode;
  to: ScanMode;
}

export interface ScanCardShownFields {
  customer_ref: string;
  mode: ScanMode;
  /** Dalla lettura del codice alla scheda cliente sullo schermo. */
  duration_ms: number;
}

export interface ScanStampConfirmedFields {
  customer_ref: string;
  /** Dal tocco su "+1 timbro" alla conferma. */
  duration_ms: number;
  /** Dalla lettura del codice alla conferma del timbro (obiettivo: meno di 2 secondi). */
  since_scan_ms: number;
}

export interface AppUnexpectedErrorFields {
  /** Dove è successo, in parole semplici (es. "caricamento dei negozi"). */
  where: string;
  error_name: string;
  error_message: string;
}

export interface AppPasswordChangedFields {
  via: "recupero" | "invito";
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

/* ---------- pannello interno e assistenza (Fase 9) ---------- */

/** Chi del team ha agito (nome, mai l'email in chiaro). */
export interface SupportActorFields {
  support_name: string;
}

export interface SupportLoginFields extends SupportActorFields {
  /** true = primo accesso: ha appena collegato l'app di autenticazione. */
  factor_enrolled: boolean;
}

export type SupportLoginStage = "password" | "codice" | "collegamento";
export interface SupportLoginFailedFields {
  /** Email mascherata. */
  email: string;
  stage: SupportLoginStage;
  reason: string;
}

export type SupportDeniedReason = "sessione assente" | "non nel team" | "secondo fattore mancante";
export interface SupportAccessDeniedFields {
  route: string;
  reason: SupportDeniedReason;
  /** Email mascherata, se c'è una sessione. */
  email: string | null;
}

export type SupportQueryKind =
  | "codice errore"
  | "richiesta"
  | "ticket diagnostica"
  | "carta"
  | "telefono"
  | "email staff"
  | "negozio"
  | "codice di errore del catalogo";
export interface SupportSearchFields extends SupportActorFields {
  query_kind: SupportQueryKind;
  /** Testo cercato già reso sicuro (il telefono diventa un estratto del suo hash). */
  query: string;
  results: number;
}

export type SupportSubjectKind = "negozio" | "cliente" | "richiesta" | "utente staff";
export interface SupportTimelineViewedFields extends SupportActorFields {
  subject_kind: SupportSubjectKind;
  /** Nome del negozio, codice carta, codice assistenza o email mascherata. */
  subject: string;
  rows: number;
}

export interface SupportResyncFields extends SupportActorFields {
  shop_name: string;
  /** Codice della carta; null = tutto il negozio. */
  customer_ref: string | null;
  cards: number;
  cards_ok: number;
  template_ok: boolean;
}

export interface SupportCustomerExportFields extends SupportActorFields, CardFields {
  size_bytes: number;
  reason: string;
}

export interface SupportCustomerDeleteFields extends SupportActorFields, CardFields {
  reason: string;
  stamps_at_delete: number;
  rewards_at_delete: number;
  audit_rows_pseudonymized: number;
}

export interface SupportMemberAddedFields {
  support_name: string;
  /** Email mascherata. */
  email: string;
  added_by: string;
  existing_account: boolean;
}

export interface ShopCreatedFields extends SupportActorFields {
  shop_name: string;
  slug: string;
  owner_name: string;
  /** Email mascherata del titolare. */
  owner_email: string;
  existing_account: boolean;
}

export interface ShopStatusFields extends SupportActorFields {
  shop_name: string;
  slug: string;
  reason: string;
  /** Carte attive del negozio, che il cron disattiva o riattiva su Google. */
  cards: number;
}

export interface ShopLegalUpdatedFields extends SupportActorFields {
  shop_name: string;
  changes: string;
}

export interface LogDbSinkFailedFields {
  rows: number;
  error_message: string;
}

export interface LogRetentionPurgedFields {
  expired: number;
  diagnostic: number;
}

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

const enea: SupportActorFields = { support_name: "Enea" };
const cardSupport = { ...enea, customer_ref: "A3F2C91B", shop_name: "Salone Mario" };

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

const funnel: EnrollFunnelFields = { enrollment_id: "8a1f2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d", shop_name: "Salone Mario" };

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

  "stamp.add.forced": defineEvent<StampForcedFields>({
    level: "warn",
    description:
      'Timbro dato durante il cooldown con "Aggiungi comunque": resta nell\'audit. Se succede spesso, parlarne con il titolare.',
    msg: (f) =>
      `${cap(actor(f))} ha forzato un timbro sulla ${card(f)} durante il cooldown (mancavano ${minutes(f.minutes_left)} ` +
      `su ${minutes(f.cooldown_min)}): ${f.stamps_before} → ${f.stamps_after} su ${f.stamps_required}, registrato nell'audit.`,
    examples: [
      {
        ...giulia,
        ...cardA,
        stamps_before: 6,
        stamps_after: 7,
        stamps_required: 10,
        cooldown_min: 60,
        minutes_left: 52,
        last_stamp_at: "2026-11-03T09:32:14.000Z",
      },
    ],
  }),
  "stamp.add.duplicate_ignored": defineEvent<DuplicateIgnoredFields>({
    level: "info",
    description:
      'Doppio tocco o richiesta ripetuta dalla rete su "+1 timbro": la stessa chiave di idempotenza non dà un secondo timbro.',
    msg: (f) =>
      `Richiesta ripetuta di ${actor(f)} (timbro sulla ${card(f)}) ignorata: è la stessa del ${when(f.original_at)} ` +
      `(${f.seconds_since} s prima), già eseguita una volta sola.`,
    examples: [{ ...giulia, ...cardA, original_at: "2026-11-03T09:32:14.000Z", seconds_since: 1 }],
  }),
  "stamp.undo.duplicate_ignored": defineEvent<DuplicateIgnoredFields>({
    level: "info",
    description: "Richiesta di annullamento ripetuta con la stessa chiave: eseguita una volta sola.",
    msg: (f) =>
      `Richiesta ripetuta di ${actor(f)} (annullamento del timbro sulla ${card(f)}) ignorata: è la stessa del ${when(f.original_at)} ` +
      `(${f.seconds_since} s prima), già eseguita una volta sola.`,
    examples: [{ ...giulia, ...cardA, original_at: "2026-11-03T09:32:14.000Z", seconds_since: 1 }],
  }),
  "reward.redeem.duplicate_ignored": defineEvent<DuplicateIgnoredFields>({
    level: "info",
    description: "Richiesta di riscatto ripetuta con la stessa chiave: il premio è scalato una volta sola.",
    msg: (f) =>
      `Richiesta ripetuta di ${actor(f)} (riscatto del premio sulla ${card(f)}) ignorata: è la stessa del ${when(f.original_at)} ` +
      `(${f.seconds_since} s prima), già eseguita una volta sola.`,
    examples: [{ ...giulia, ...cardA, original_at: "2026-11-03T09:32:14.000Z", seconds_since: 1 }],
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

  "logo.upload.ok": defineEvent<LogoUploadOkFields>({
    level: "info",
    description: "Il nuovo logo è stato caricato, verificato e pubblicato: le carte nel Wallet si aggiornano.",
    msg: (f) =>
      `${cap(actor(f))} ha pubblicato il nuovo logo del negozio ${f.shop_name} (${f.content_type}, ${kb(f.size_bytes)}): ` +
      `le carte nel Wallet si aggiornano entro qualche minuto.`,
    examples: [{ ...titolare, shop_name: "Salone Mario", content_type: "image/png", size_bytes: 184_320 }],
  }),
  "logo.upload.failed": defineEvent<LogoUploadFailedFields>({
    level: "warn",
    description:
      "Logo non caricato: invio del file allo Storage fallito (dall'app) o file non valido alla verifica (dal server). Il logo precedente resta.",
    msg: (f) =>
      `Logo del negozio ${f.shop_name} non aggiornato: ${f.stage === "caricamento" ? "invio del file non riuscito" : "file non valido"} ` +
      `(${f.reason}${f.http_status === null ? "" : `, HTTP ${f.http_status}`}). Resta il logo precedente.`,
    examples: [
      { shop_name: "Salone Mario", stage: "caricamento", reason: "rete interrotta", http_status: null },
      { shop_name: "Salone Mario", stage: "verifica", reason: "immagine di 3,1 MB, massimo 2 MB", http_status: 413 },
    ],
  }),
  "staff.invite.resent": defineEvent<StaffInviteResentFields>({
    level: "info",
    description: "Il titolare ha reinviato l'email d'invito a chi non l'aveva ancora accettato.",
    msg: (f) =>
      `${cap(actor(f))} ha reinviato l'invito del negozio ${f.shop_name} a ${f.member_name} (${f.member_email}).`,
    examples: [{ ...titolare, shop_name: "Salone Mario", member_name: "Ilaria", member_email: "il***@gmail.com" }],
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

  "enroll.form.submitted": defineEvent<EnrollFormSubmittedFields>({
    level: "info",
    description: "Funnel di iscrizione, passo 1: il cliente ha compilato il form (nome, telefono, consensi).",
    msg: (f) =>
      `Iscrizione avviata al negozio ${f.shop_name} ${f.platform === "public-web" ? "dal web pubblico" : `da ${PLATFORM_LABEL[f.platform] ?? "un browser"}`}: ` +
      `form compilato (consenso marketing: ${f.consent_marketing ? "sì" : "no"}).`,
    examples: [{ shop_name: "Salone Mario", phone: "+393331234567", consent_marketing: true, platform: "public-web" }],
  }),

  "enroll.captcha.failed": defineEvent<EnrollCaptchaFailedFields>({
    level: "warn",
    description: "Funnel di iscrizione: il controllo anti-bot non è stato superato, nessun SMS inviato.",
    msg: (f) =>
      `Iscrizione al negozio ${f.shop_name} fermata dal controllo anti-bot (${f.reason}): nessun SMS inviato.`,
    examples: [{ shop_name: "Salone Mario", reason: "timeout-or-duplicate" }],
  }),

  "enroll.otp.sent": defineEvent<EnrollOtpSentFields>({
    level: "info",
    description: "Funnel di iscrizione, passo 2: SMS con il codice inviato (o nuovo codice chiesto dal cliente).",
    msg: (f) =>
      `${f.send_number === 1 ? "SMS con il codice inviato" : `Nuovo codice inviato (SMS n. ${f.send_number})`} per l'iscrizione al negozio ${f.shop_name} in ${f.duration_ms} ms.`,
    examples: [
      { ...funnel, phone: "+393331234567", send_number: 1, duration_ms: 640 },
      { ...funnel, phone: "+393331234567", send_number: 2, duration_ms: 590 },
    ],
  }),

  "enroll.otp.send_failed": defineEvent<EnrollOtpSendFailedFields>({
    level: "error",
    description: "Funnel di iscrizione: il fornitore SMS non ha inviato il codice. Il cliente non può proseguire.",
    msg: (f) =>
      `SMS con il codice NON inviato per l'iscrizione al negozio ${f.shop_name}: Twilio ha risposto ` +
      `${f.http_status === null ? "senza risposta" : `status ${f.http_status}`} ("${f.provider_response.slice(0, 160)}"). ` +
      `Azione: controllare credito e credenziali Twilio.`,
    examples: [
      {
        ...funnel,
        http_status: 401,
        error_code: "E_OTP_SEND_FAILED",
        provider_response: "Authenticate",
        duration_ms: 210,
      },
    ],
  }),

  "enroll.otp.limited": defineEvent<EnrollOtpLimitedFields>({
    level: "warn",
    description:
      "Funnel di iscrizione: SMS non inviato per un limite (per numero, per IP o numero bloccato). Molti blocchi per IP = possibile abuso.",
    msg: (f) =>
      `SMS per l'iscrizione al negozio ${f.shop_name} non inviato: superato il limite per ${f.scope}. ` +
      `Si può riprovare tra ${minutes(f.retry_after_min)}.`,
    examples: [{ shop_name: "Salone Mario", scope: "numero", retry_after_min: 60 }],
  }),

  "enroll.otp.verified": defineEvent<EnrollOtpVerifiedFields>({
    level: "info",
    description: "Funnel di iscrizione, passo 3: codice corretto, telefono verificato.",
    msg: (f) =>
      `Telefono verificato per l'iscrizione al negozio ${f.shop_name} (${f.attempts === 1 ? "al primo tentativo" : `al tentativo n. ${f.attempts}`}).`,
    examples: [{ ...funnel, attempts: 1 }],
  }),

  "enroll.otp.wrong_code": defineEvent<EnrollOtpWrongCodeFields>({
    level: "warn",
    description: "Funnel di iscrizione: codice sbagliato, il cliente ha ancora tentativi.",
    msg: (f) =>
      `Codice sbagliato nell'iscrizione al negozio ${f.shop_name}: ${f.attempts_left === 1 ? "resta 1 tentativo" : `restano ${f.attempts_left} tentativi`}.`,
    examples: [{ ...funnel, attempts_left: 2 }],
  }),

  "enroll.otp.too_many_attempts": defineEvent<EnrollOtpBlockedFields>({
    level: "warn",
    description: "Funnel di iscrizione: 5 codici sbagliati, iscrizione annullata e numero bloccato.",
    msg: (f) =>
      `Iscrizione al negozio ${f.shop_name} bloccata dopo 5 codici sbagliati: il numero potrà riprovare tra ${minutes(f.blocked_min)}.`,
    examples: [{ ...funnel, blocked_min: 15 }],
  }),

  "enroll.wallet.link.shown": defineEvent<EnrollWalletLinkFields>({
    level: "info",
    description: "Funnel di iscrizione, passo 5: al cliente è stato mostrato il modo per salvare la carta.",
    msg: (f) =>
      `Al cliente della carta ${f.customer_ref} (negozio ${f.shop_name}) è stato mostrato ${WALLET_LABEL[f.wallet] ?? f.wallet}.`,
    examples: [{ ...funnel, customer_ref: "A3F2C91B", wallet: "google" }],
  }),

  "enroll.wallet.link.clicked": defineEvent<EnrollWalletLinkFields>({
    level: "info",
    description: "Funnel di iscrizione, ultimo passo: il cliente ha aperto il link per salvare la carta nel Wallet.",
    msg: (f) =>
      `Il cliente della carta ${f.customer_ref} (negozio ${f.shop_name}) ha aperto ${f.wallet === "qr-da-computer" ? "dal telefono il QR mostrato sul computer" : "il link per salvare la carta nel Wallet"}.`,
    examples: [
      { ...funnel, customer_ref: "A3F2C91B", wallet: "google" },
      { ...funnel, customer_ref: "A3F2C91B", wallet: "qr-da-computer" },
    ],
  }),

  "enroll.shop.unavailable": defineEvent<EnrollShopUnavailableFields>({
    level: "warn",
    description: "Qualcuno ha aperto la pagina di iscrizione di un negozio inesistente o sospeso.",
    msg: (f) =>
      f.reason === "sospeso"
        ? `Pagina di iscrizione aperta per il negozio "${f.slug}", che è sospeso: mostrata la pagina dedicata.`
        : `Pagina di iscrizione aperta per "${f.slug}", che non corrisponde a nessun negozio (QR o link sbagliato?).`,
    examples: [
      { slug: "salone-norra", reason: "inesistente" },
      { slug: "salone-mario", reason: "sospeso" },
    ],
  }),

  "marketing.unsubscribe.ok": defineEvent<MarketingUnsubscribeFields>({
    level: "info",
    description: "Il cliente si è disiscritto dalle promozioni con il link nel messaggio (link monouso).",
    msg: (f) =>
      f.already_unsubscribed
        ? `Link di disiscrizione della carta ${f.customer_ref} (negozio ${f.shop_name}) usato di nuovo: il cliente era già disiscritto.`
        : `Il cliente della carta ${f.customer_ref} (negozio ${f.shop_name}) si è disiscritto dalle promozioni dal link nel messaggio.`,
    examples: [
      { ...cardA, already_unsubscribed: false },
      { ...cardA, already_unsubscribed: true },
    ],
  }),

  "counter_qr.public_downloaded": defineEvent<CounterQrPublicFields>({
    level: "info",
    description: "Il PDF del cartello A5 è stato scaricato dalla pagina pubblica /<negozio>/qr.",
    msg: (f) =>
      `Cartello A5 del negozio ${f.shop_name} scaricato dalla pagina pubblica (PDF di ${kb(f.size_bytes)}, ${f.duration_ms} ms).`,
    examples: [{ shop_name: "Salone Mario", size_bytes: 48_000, duration_ms: 420 }],
  }),

  "public.link.invalid": defineEvent<PublicLinkInvalidFields>({
    level: "warn",
    description:
      "Qualcuno ha aperto un link pubblico firmato non valido (scaduto, manomesso o di una carta cancellata).",
    msg: (f) =>
      `Aperto un link ${f.link_kind === "carta" ? "per salvare la carta" : "di disiscrizione"} non valido (${f.reason}): mostrata la pagina di link scaduto.`,
    examples: [
      { link_kind: "carta", reason: "scaduto" },
      { link_kind: "disiscrizione", reason: "firma non valida" },
    ],
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
  "app.start": defineEvent<AppStartFields>({
    level: "info",
    description: "L'app esercente è stata aperta: piattaforma, versione e dispositivo (prima riga della diagnostica).",
    msg: (f) =>
      `App esercente avviata su ${PLATFORM_LABEL[f.platform] ?? f.platform} ${f.os_version} (${f.device}), versione ${f.app_version} build ${f.build}.`,
    examples: [{ platform: "ios", app_version: "1.4.0", build: "12", device: "iPhone 15", os_version: "26.4" }],
  }),
  "app.login.ok": defineEvent<AppLoginOkFields>({
    level: "info",
    description: "Lo staff ha fatto login nell'app.",
    msg: (f) =>
      `Accesso riuscito per ${maskEmail(f.email)}: ${f.shops_count === 1 ? "1 negozio disponibile" : `${f.shops_count} negozi disponibili`}.`,
    examples: [
      { email: "giulia@salone-mario.it", shops_count: 1 },
      { email: "marco@salone-mario.it", shops_count: 0 },
    ],
  }),
  "app.login.failed": defineEvent<AppLoginFailedFields>({
    level: "warn",
    description: "Login rifiutato: credenziali errate, invito non accettato o servizio non raggiungibile.",
    msg: (f) => `Accesso non riuscito per ${maskEmail(f.email)}: ${f.reason} (${f.error_code}).`,
    examples: [
      { email: "giulia@salone-mario.it", error_code: "E_LOGIN_FAILED", reason: "email o password non corrette" },
      {
        email: "giulia@salone-mario.it",
        error_code: "E_NETWORK",
        reason: "server di autenticazione non raggiungibile",
      },
    ],
  }),
  "app.logout": defineEvent<AppLogoutFields>({
    level: "info",
    description: "Uscita dall'app: scelta dall'utente o forzata perché la sessione non si è potuta rinnovare.",
    msg: (f) =>
      f.reason === "manuale"
        ? "L'utente è uscito dall'app con il pulsante Esci."
        : "Sessione scaduta e non rinnovabile: l'app è tornata alla schermata di accesso.",
    examples: [{ reason: "manuale" }, { reason: "sessione scaduta" }],
  }),
  "app.shop.selected": defineEvent<AppShopSelectedFields>({
    level: "info",
    description: "Negozio su cui l'app sta lavorando (scelto, cambiato o ricordato dall'ultima volta).",
    msg: (f) => {
      const how = {
        "unico negozio": "l'unico disponibile",
        scelta: "scelto",
        cambio: "cambiato dal menu",
        ricordato: "ricordato dall'ultima volta",
      }[f.how];
      return `Negozio attivo nell'app: ${f.shop_name}, ruolo ${ROLE_NAME[f.role]} (${how}).`;
    },
    examples: [
      { shop_name: "Salone Mario", role: "owner", how: "unico negozio" },
      { shop_name: "Barbiere Demo", role: "operator", how: "cambio" },
    ],
  }),
  "app.api.error": defineEvent<AppApiErrorFields>({
    level: "warn",
    description:
      "Una chiamata dell'app al server è fallita. Con il request_id si trova la riga corrispondente nei log del backend; se manca, la richiesta non è arrivata.",
    msg: (f) =>
      `Chiamata ${f.method} ${f.endpoint} fallita ${f.http_status === null ? "senza risposta dal server" : `con ${f.http_status}`} in ${f.duration_ms} ms: ` +
      `${f.error_code}, codice assistenza ${f.support_code}.`,
    examples: [
      {
        request_id: "01JB7K3QXM8Z2V4T6R9P0N1C5D",
        method: "POST",
        endpoint: "/api/v1/merchant/stamp",
        http_status: 400,
        error_code: "E_VALIDATION",
        support_code: "ERR-K3QXM",
        duration_ms: 120,
      },
      {
        request_id: "01JB7K3QXM8Z2V4T6R9P0N1C5D",
        method: "GET",
        endpoint: "/api/v1/merchant/me",
        http_status: null,
        error_code: "E_NETWORK",
        support_code: "ERR-K3QXM",
        duration_ms: 15000,
      },
    ],
  }),
  "app.offline": defineEvent<Record<string, never>>({
    level: "warn",
    description:
      'Il dispositivo ha perso la connessione: l\'app mostra "Sei offline" e blocca le azioni che richiedono il server.',
    msg: () => 'Il dispositivo è offline: mostrato il banner "Sei offline", azioni che richiedono il server bloccate.',
    examples: [{}],
  }),
  "app.online": defineEvent<AppOnlineFields>({
    level: "info",
    description: "La connessione è tornata dopo un periodo offline.",
    msg: (f) =>
      `Connessione tornata dopo ${f.offline_s < 60 ? `${f.offline_s} secondi` : minutes(Math.round(f.offline_s / 60))} offline.`,
    examples: [{ offline_s: 42 }, { offline_s: 600 }],
  }),
  "app.diagnostics.sent": defineEvent<AppDiagnosticsSentFields>({
    level: "info",
    description: "L'utente ha premuto \"Invia diagnostica all'assistenza\" e il server ha restituito il codice ticket.",
    msg: (f) =>
      `Diagnostica inviata all'assistenza: ticket ${f.ticket_code} (${f.events_count} eventi, ${kb(f.size_bytes)}).`,
    examples: [{ ticket_code: "DIAG-7K3QXA2M", events_count: 412, size_bytes: 38_000 }],
  }),
  "app.password.reset_requested": defineEvent<AppEmailFields>({
    level: "info",
    description: 'Richiesto il link per reimpostare la password ("Password dimenticata?").',
    msg: (f) => `Richiesto il link per reimpostare la password di ${maskEmail(f.email)}.`,
    examples: [{ email: "giulia@salone-mario.it" }],
  }),
  "app.password.changed": defineEvent<AppPasswordChangedFields>({
    level: "info",
    description: "Lo staff ha impostato una nuova password, dal link di recupero o accettando l'invito.",
    msg: (f) =>
      f.via === "invito"
        ? "Invito accettato: password impostata e accesso eseguito."
        : "Password reimpostata dal link di recupero e accesso eseguito.",
    examples: [{ via: "recupero" }, { via: "invito" }],
  }),
  "scan.read.ok": defineEvent<ScanReadOkFields>({
    level: "info",
    description:
      "Lo scanner dell'app ha letto un codice valido (QR della carta o codice breve): parte la ricerca della carta.",
    msg: (f) => `Letto ${f.kind === "QR" ? "il QR di una carta" : "un codice breve"} con ${SCAN_MODE_LABEL[f.mode]}.`,
    examples: [
      { mode: "fotocamera", kind: "QR" },
      { mode: "manuale", kind: "codice breve" },
    ],
  }),
  "scan.read.invalid": defineEvent<ScanReadInvalidFields>({
    level: "warn",
    description:
      "Lo scanner ha letto qualcosa che non è una carta (altro QR, codice incompleto): nessuna chiamata al server.",
    msg: (f) =>
      `Lettura scartata (${SCAN_MODE_LABEL[f.mode]}): ${f.reason}, non è un QR della carta né un codice breve.`,
    examples: [
      { mode: "fotocamera", reason: "URL di un sito" },
      { mode: "lettore", reason: "testo di 12 caratteri" },
    ],
  }),
  "scan.camera.denied": defineEvent<ScanCameraDeniedFields>({
    level: "warn",
    description:
      "Permesso della fotocamera negato: lo scanner propone le impostazioni, il lettore esterno o il codice a mano.",
    msg: (f) =>
      f.can_ask_again
        ? "Permesso della fotocamera negato: l'app può chiederlo di nuovo."
        : "Permesso della fotocamera negato in modo permanente: va riattivato dalle impostazioni del dispositivo.",
    examples: [{ can_ask_again: true }, { can_ask_again: false }],
  }),
  "scan.mode.changed": defineEvent<ScanModeChangedFields>({
    level: "info",
    description: "Cambiata la modalità dello scanner (fotocamera, lettore QR esterno, codice a mano); viene ricordata.",
    msg: (f) => `Scanner passato da ${SCAN_MODE_LABEL[f.from]} a ${SCAN_MODE_LABEL[f.to]}.`,
    examples: [{ from: "fotocamera", to: "lettore" }],
  }),
  "scan.card.shown": defineEvent<ScanCardShownFields>({
    level: "info",
    description: "Scheda cliente aperta dopo una lettura: tempo dalla lettura alla scheda.",
    msg: (f) =>
      `Scheda della carta ${f.customer_ref} aperta in ${f.duration_ms} ms dalla lettura (${SCAN_MODE_LABEL[f.mode]}).`,
    examples: [{ customer_ref: "A3F2C91B", mode: "fotocamera", duration_ms: 420 }],
  }),
  "scan.stamp.confirmed": defineEvent<ScanStampConfirmedFields>({
    level: "info",
    description:
      "Timbro confermato nell'app: tempo dal tocco alla conferma e dalla lettura del codice (obiettivo sotto i 2 secondi).",
    msg: (f) =>
      `Timbro sulla carta ${f.customer_ref} confermato in ${f.duration_ms} ms dal tocco, ${(f.since_scan_ms / 1000).toFixed(1)} s dalla lettura del codice.`,
    examples: [{ customer_ref: "A3F2C91B", duration_ms: 310, since_scan_ms: 1650 }],
  }),
  "app.error.unexpected": defineEvent<AppUnexpectedErrorFields>({
    level: "error",
    description:
      "Errore imprevisto nel codice dell'app (non una risposta del server): va segnalato allo sviluppo con la diagnostica e Sentry.",
    msg: (f) => `Errore imprevisto nell'app durante ${f.where}: ${f.error_name}: ${f.error_message}.`,
    examples: [
      { where: "il caricamento dei negozi", error_name: "TypeError", error_message: "shops.map is not a function" },
    ],
  }),
  "support.login": defineEvent<SupportLoginFields>({
    level: "info",
    description: "Un membro del team è entrato nel pannello interno (password e codice dell'app di autenticazione).",
    msg: (f) =>
      f.factor_enrolled
        ? `${f.support_name} (assistenza) ha collegato l'app di autenticazione ed è entrato nel pannello interno.`
        : `${f.support_name} (assistenza) è entrato nel pannello interno con password e codice dell'app di autenticazione.`,
    examples: [
      { ...enea, factor_enrolled: false },
      { ...enea, factor_enrolled: true },
    ],
  }),

  "support.login.failed": defineEvent<SupportLoginFailedFields>({
    level: "warn",
    description: "Accesso al pannello interno rifiutato (password, codice o collegamento dell'app di autenticazione).",
    msg: (f) =>
      `Accesso al pannello interno rifiutato per ${f.email} al passo "${f.stage}": ${f.reason}. ` +
      `Se si ripete con i dati giusti, vedere E_SUPPORT_LOGIN_FAILED nel runbook.`,
    examples: [
      { email: "en***@loyaltywallet.it", stage: "password", reason: "email o password non corrette" },
      {
        email: "en***@loyaltywallet.it",
        stage: "codice",
        reason: "codice dell'app di autenticazione non valido o scaduto",
      },
    ],
  }),

  "support.access.denied": defineEvent<SupportAccessDeniedFields>({
    level: "warn",
    description: "Qualcuno ha provato ad aprire una pagina o un'azione del pannello interno senza averne diritto.",
    msg: (f) =>
      `Accesso negato al pannello interno (${f.route}) ${f.email ? `per ${f.email}` : "senza sessione"}: ${f.reason}.`,
    examples: [
      { route: "/interno", reason: "sessione assente", email: null },
      { route: "/interno/negozi", reason: "non nel team", email: "gi***@salone-mario.it" },
      { route: "/interno", reason: "secondo fattore mancante", email: "en***@loyaltywallet.it" },
    ],
  }),

  "support.logout": defineEvent<SupportActorFields>({
    level: "info",
    description: "Un membro del team è uscito dal pannello interno.",
    msg: (f) => `${f.support_name} (assistenza) è uscito dal pannello interno.`,
    examples: [enea],
  }),

  "support.search": defineEvent<SupportSearchFields>({
    level: "info",
    description:
      "Ricerca nella vista Assistenza (l'accesso ai dati è tracciato): tipo riconosciuto e numero di risultati.",
    msg: (f) =>
      `${f.support_name} (assistenza) ha cercato ${f.query_kind} "${f.query}": ` +
      (f.results === 0 ? "nessun risultato." : f.results === 1 ? "1 risultato." : `${f.results} risultati.`),
    examples: [
      { ...enea, query_kind: "codice errore", query: "ERR-7K3QX", results: 1 },
      { ...enea, query_kind: "telefono", query: "hash 3f9a1c…", results: 0 },
      { ...enea, query_kind: "negozio", query: "salone", results: 2 },
    ],
  }),

  "support.timeline.viewed": defineEvent<SupportTimelineViewedFields>({
    level: "info",
    description:
      "Apertura di una timeline nella vista Assistenza: chi ha consultato i log di quale negozio, cliente o richiesta.",
    msg: (f) =>
      `${f.support_name} (assistenza) ha aperto la timeline di ${f.subject_kind} ${f.subject} (${f.rows} righe).`,
    examples: [
      { ...enea, subject_kind: "cliente", subject: "A3F2C91B", rows: 42 },
      { ...enea, subject_kind: "richiesta", subject: "ERR-7K3QX", rows: 6 },
    ],
  }),

  "support.resync": defineEvent<SupportResyncFields>({
    level: "info",
    description: "L'assistenza ha risincronizzato con Google Wallet una carta o un intero negozio dal pannello.",
    msg: (f) =>
      f.customer_ref
        ? `${f.support_name} (assistenza) ha risincronizzato la carta ${f.customer_ref} del negozio ${f.shop_name} su Google Wallet: riuscito.`
        : `${f.support_name} (assistenza) ha risincronizzato il negozio ${f.shop_name} su Google Wallet: template ${f.template_ok ? "ok" : "in errore"}, ${f.cards_ok}/${f.cards} carte allineate.`,
    examples: [
      { ...cardSupport, cards: 1, cards_ok: 1, template_ok: true },
      { ...enea, shop_name: "Salone Mario", customer_ref: null, cards: 120, cards_ok: 120, template_ok: true },
    ],
  }),

  "support.resync.failed": defineEvent<SupportResyncFields>({
    level: "warn",
    description:
      "Risincronizzazione dal pannello non completa: il motivo è nella riga wallet.google.* della stessa richiesta.",
    msg: (f) =>
      f.customer_ref
        ? `Risincronizzazione della carta ${f.customer_ref} del negozio ${f.shop_name} chiesta da ${f.support_name} non riuscita: ` +
          `il motivo è nella riga wallet.google.* della stessa richiesta; i nuovi tentativi partono da soli.`
        : `Risincronizzazione del negozio ${f.shop_name} chiesta da ${f.support_name} incompleta: template ${f.template_ok ? "ok" : "in errore"}, ` +
          `${f.cards_ok}/${f.cards} carte allineate. Il motivo è nelle righe wallet.google.* della stessa richiesta.`,
    examples: [
      { ...cardSupport, cards: 1, cards_ok: 0, template_ok: true },
      { ...enea, shop_name: "Salone Mario", customer_ref: null, cards: 120, cards_ok: 0, template_ok: false },
    ],
  }),

  "support.diagnostic.enabled": defineEvent<DiagnosticModeFields>({
    level: "info",
    description: "Modalità diagnostica attivata dal pannello interno (con scope, durata e motivo).",
    msg: (f) =>
      `${cap(f.enabled_by)} (assistenza) ha attivato dal pannello la modalità diagnostica ${f.diagnostic_level} per ${scope(f)} ` +
      `fino al ${when(f.expires_at)}. Motivo: ${f.reason}.`,
    examples: [diagnostic],
  }),

  "support.diagnostic.disabled": defineEvent<DiagnosticModeDisabledFields>({
    level: "info",
    description: "Modalità diagnostica spenta dal pannello interno prima della scadenza.",
    msg: (f) =>
      `${cap(f.disabled_by)} (assistenza) ha disattivato dal pannello la modalità diagnostica per ${scope(f)} prima della scadenza ` +
      `(attiva dal ${when(f.enabled_at)}; motivo: ${f.reason}).`,
    examples: [{ ...diagnostic, disabled_by: "Enea" }],
  }),

  "support.customer.export": defineEvent<SupportCustomerExportFields>({
    level: "info",
    description: "Esportazione GDPR dei dati di un cliente (file JSON da inviare all'interessato), con il motivo.",
    msg: (f) =>
      `${f.support_name} (assistenza) ha esportato i dati della ${card(f)} (${bytes(f.size_bytes)}) per una richiesta GDPR. Motivo: ${f.reason}.`,
    examples: [{ ...cardSupport, size_bytes: 5320, reason: "richiesta di accesso via email del 03/11" }],
  }),

  "support.customer.delete": defineEvent<SupportCustomerDeleteFields>({
    level: "info",
    description:
      "Cancellazione GDPR di un cliente fatta dall'assistenza: dati personali tolti, storico pseudonimizzato, carta disattivata.",
    msg: (f) =>
      `${f.support_name} (assistenza) ha cancellato i dati della ${card(f)} su richiesta GDPR (aveva ${f.stamps_at_delete} timbri e ` +
      `${f.rewards_at_delete} premi; ${f.audit_rows_pseudonymized} righe di storico pseudonimizzate). Motivo: ${f.reason}. ` +
      `La carta nel wallet viene disattivata.`,
    examples: [
      {
        ...cardSupport,
        reason: "richiesta di cancellazione via email del 03/11",
        stamps_at_delete: 4,
        rewards_at_delete: 0,
        audit_rows_pseudonymized: 7,
      },
    ],
  }),

  "support.member.added": defineEvent<SupportMemberAddedFields>({
    level: "info",
    description: "Persona aggiunta al team interno (accesso al pannello con 2FA), da riga di comando.",
    msg: (f) =>
      `${f.support_name} (${f.email}) aggiunto al team interno da ${f.added_by}` +
      (f.existing_account
        ? ": aveva già un account, entra con la sua password."
        : ": inviata l'email per scegliere la password."),
    examples: [
      { support_name: "Sara", email: "sa***@loyaltywallet.it", added_by: "Enea", existing_account: false },
      { support_name: "Sara", email: "sa***@loyaltywallet.it", added_by: "Enea", existing_account: true },
    ],
  }),

  "shop.created": defineEvent<ShopCreatedFields>({
    level: "info",
    description: "Nuovo negozio creato dal pannello interno, con il titolare invitato.",
    msg: (f) =>
      `${f.support_name} (assistenza) ha creato il negozio ${f.shop_name} (indirizzo /${f.slug}) con titolare ${f.owner_name} (${f.owner_email})` +
      (f.existing_account
        ? ": aveva già un account, trova il negozio nell'app."
        : ": inviata l'email d'invito per scegliere la password."),
    examples: [
      {
        ...enea,
        shop_name: "Barberia Rossi",
        slug: "barberia-rossi",
        owner_name: "Luca",
        owner_email: "lu***@gmail.com",
        existing_account: false,
      },
      {
        ...enea,
        shop_name: "Barberia Rossi",
        slug: "barberia-rossi",
        owner_name: "Luca",
        owner_email: "lu***@gmail.com",
        existing_account: true,
      },
    ],
  }),

  "shop.suspended": defineEvent<ShopStatusFields>({
    level: "info",
    description:
      "Negozio sospeso dall'assistenza: app esercente e pagina di iscrizione bloccate, carte disattivate su Google dal cron.",
    msg: (f) =>
      `${f.support_name} (assistenza) ha sospeso il negozio ${f.shop_name} (/${f.slug}). Motivo: ${f.reason}. ` +
      `L'app e la pagina di iscrizione sono bloccate; le ${f.cards} carte vengono disattivate su Google entro qualche minuto.`,
    examples: [
      { ...enea, shop_name: "Salone Mario", slug: "salone-mario", reason: "abbonamento non rinnovato", cards: 120 },
    ],
  }),

  "shop.reactivated": defineEvent<ShopStatusFields>({
    level: "info",
    description: "Negozio riattivato dall'assistenza: app e iscrizioni di nuovo aperte, carte riattivate dal cron.",
    msg: (f) =>
      `${f.support_name} (assistenza) ha riattivato il negozio ${f.shop_name} (/${f.slug}). Motivo: ${f.reason}. ` +
      `Le ${f.cards} carte tornano attive su Google entro qualche minuto.`,
    examples: [
      { ...enea, shop_name: "Salone Mario", slug: "salone-mario", reason: "abbonamento rinnovato", cards: 120 },
    ],
  }),

  "shop.legal.updated": defineEvent<ShopLegalUpdatedFields>({
    level: "info",
    description:
      "Dati del titolare per l'informativa privacy (ragione sociale, partita IVA, email privacy) cambiati dall'assistenza.",
    msg: (f) =>
      `${f.support_name} (assistenza) ha aggiornato i dati per l'informativa del negozio ${f.shop_name}: ${f.changes}.`,
    examples: [{ ...enea, shop_name: "Salone Mario", changes: "partita IVA, email privacy" }],
  }),

  "log.db_sink.failed": defineEvent<LogDbSinkFailedFields>({
    level: "warn",
    description:
      "Le righe di log non sono state copiate nel database (tabella log_events): mancheranno nella timeline della vista Assistenza, restano nel servizio di log.",
    msg: (f) =>
      `${f.rows === 1 ? "1 riga" : `${f.rows} righe`} di log non copiate nel database per la vista Assistenza: ${f.error_message}. ` +
      `Restano nel servizio di log esterno; se si ripete controllare Supabase.`,
    examples: [{ rows: 12, error_message: "fetch failed (Supabase non raggiungibile)" }],
  }),

  "log.retention.purged": defineEvent<LogRetentionPurgedFields>({
    level: "info",
    description: "Pulizia dei log copiati nel database: oltre 30 giorni (7 per quelli di modalità diagnostica).",
    msg: (f) =>
      `Pulizia dei log della vista Assistenza: tolte ${f.expired} righe più vecchie di 30 giorni e ${f.diagnostic} righe di modalità diagnostica più vecchie di 7 giorni.`,
    examples: [{ expired: 5000, diagnostic: 120 }],
  }),

  "app.invite.accepted": defineEvent<AppEmailFields>({
    level: "info",
    description: "Lo staff ha aperto il link d'invito e la sessione è valida: deve solo scegliere la password.",
    msg: (f) => `Aperto il link d'invito di ${maskEmail(f.email)}: in attesa della scelta della password.`,
    examples: [{ email: "giulia@salone-mario.it" }],
  }),
} as const;

export type EventName = keyof typeof events;
export type EventFields<E extends EventName> = (typeof events)[E] extends EventDef<infer F> ? F : never;
