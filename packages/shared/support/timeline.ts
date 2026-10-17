/**
 * Timeline della vista Assistenza (logica pura, senza database).
 * Unisce righe di provenienza diversa (log tecnici, audit di dominio, eventi dell'app dai pacchetti
 * di diagnostica), le raggruppa per request_id in blocchi leggibili ("Timbro da Giulia alle 10:32 →
 * timbro ok → Google ok 341 ms") e aggiunge, per gli errori, descrizione, causa e azione dal catalogo.
 */
import { errors, type ErrorCode } from "../errors";
import { LEVELS } from "../logger";
import type { LogLevel } from "../logging/events";
import { supportCodeFromRequestId } from "../logging/request-id";

export type TimelineSource = "log" | "audit" | "app";

export interface TimelineItem {
  /** ISO 8601 UTC. */
  ts: string;
  source: TimelineSource;
  level: LogLevel;
  /** Evento del catalogo (log, app) o "audit.<azione>". */
  event: string;
  msg: string;
  request_id: string | null;
  error_code: string | null;
  /** Campi completi, mostrati espandendo la riga. */
  fields: Record<string, unknown>;
}

export interface ErrorExplanation {
  code: ErrorCode;
  description: string;
  probableCause: string;
  action: string;
}

export interface TimelineBlock {
  /** request_id del blocco; null = riga isolata. */
  request_id: string | null;
  support_code: string | null;
  /** Inizio del blocco (prima riga). */
  ts: string;
  /** Livello più grave tra le righe. */
  level: LogLevel;
  /** Frase che riassume il blocco (la riga più significativa). */
  title: string;
  /** Passi in breve, in ordine: "timbro ok → Google ok 341 ms". */
  steps: string[];
  items: TimelineItem[];
  /** Errori del catalogo incontrati nel blocco, senza ripetizioni. */
  errors: ErrorExplanation[];
}

const isCatalog = (code: string): code is ErrorCode => Object.hasOwn(errors, code);

export function explainError(code: string | null | undefined): ErrorExplanation | null {
  if (!code || !isCatalog(code)) return null;
  const e = errors[code];
  return { code, description: e.description, probableCause: e.probableCause, action: e.action };
}

/* ---------- audit di dominio → frase ---------- */

const AUDIT_LABEL: Record<string, string> = {
  enroll: "iscrizione",
  stamp: "timbro",
  undo: "annullamento del timbro",
  redeem: "riscatto del premio",
  adjust: "correzione del saldo",
  customer_delete: "cancellazione del cliente",
  customer_export: "esportazione GDPR dei dati",
  marketing_consent: "consenso alle promozioni",
  settings_update: "impostazioni del negozio",
  staff_invite: "invito nello staff",
  staff_revoke: "rimozione dallo staff",
  staff_role_change: "cambio di ruolo",
  promo_send: "messaggio promozionale",
  shop_create: "creazione del negozio",
  shop_suspend: "sospensione del negozio",
  shop_reactivate: "riattivazione del negozio",
  shop_legal_update: "dati per l'informativa",
  support_member_add: "aggiunta al team interno",
  wallet_resync: "risincronizzazione con Google Wallet",
  diagnostic_enable: "attivazione della modalità diagnostica",
  diagnostic_disable: "disattivazione della modalità diagnostica",
  prepaid_enroll: "creazione della tessera",
  prepaid_activate: "attivazione della tessera (pagamento ricevuto)",
  prepaid_consume: "scalo dalla tessera",
  prepaid_recharge: "ricarica della tessera (pagamento ricevuto)",
  prepaid_undo: "annullamento dello scalo",
  prepaid_adjust: "correzione del saldo della tessera",
  prepaid_product_create: "nuovo tipo di tessera",
  prepaid_product_update: "modifica del tipo di tessera",
  points_add: "punti dati per uno scontrino",
  points_undo: "annullamento dei punti",
  points_adjust: "correzione dei punti",
  points_settings_update: "carta a punti: modalità, regola o livelli",
};

const ACTOR_LABEL: Record<string, string> = {
  staff: "staff",
  customer: "il cliente",
  system: "sistema",
  support: "assistenza",
};

const short = (v: unknown): string => {
  if (v === null || v === undefined) return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
};

/** "stamps 6 → 7, rewards_available 0 → 1": solo i campi cambiati. */
export function auditDiff(before: Record<string, unknown> | null, after: Record<string, unknown> | null): string {
  const keys = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])];
  return keys
    .filter((k) => short(before?.[k]) !== short(after?.[k]))
    .map((k) =>
      before && k in before ? `${k} ${short(before[k])} → ${short(after?.[k])}` : `${k} ${short(after?.[k])}`,
    )
    .join(", ");
}

export interface AuditRow {
  ts: string;
  request_id: string | null;
  actor_type: string;
  actor_id: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  reason: string | null;
  platform: string | null;
}

export function auditItem(row: AuditRow, actorName?: string): TimelineItem {
  const what = AUDIT_LABEL[row.action] ?? row.action.replace(/_/g, " ");
  const who =
    actorName ??
    (row.actor_type === "support"
      ? `${row.actor_id ?? "assistenza"} (assistenza)`
      : (ACTOR_LABEL[row.actor_type] ?? row.actor_type));
  const diff = auditDiff(row.before, row.after);
  const msg =
    `Storico: ${what} da ${who}` + (diff ? ` — ${diff}` : "") + (row.reason ? `. Motivo: ${row.reason}` : "") + ".";
  return {
    ts: row.ts,
    source: "audit",
    level: "info",
    event: `audit.${row.action}`,
    msg,
    request_id: row.request_id,
    error_code: null,
    fields: { ...row },
  };
}

/* ---------- passi in breve ---------- */

const PROVIDER: Record<string, string> = { google: "Google", apple: "Apple" };

/** Etichetta breve di una riga per il riassunto del blocco; null = non è un passo (inizio/fine richiesta). */
export function stepLabel(item: TimelineItem): string | null {
  const e = item.event;
  if (e === "http.request.start" || e === "http.request.payload") return null;
  const f = item.fields;
  const ms = typeof f.duration_ms === "number" ? ` ${f.duration_ms} ms` : "";
  if (e === "http.request.end" || e === "http.request.failed") {
    return item.error_code
      ? `risposta ${f.status ?? ""} ${item.error_code}`.replace("  ", " ")
      : `risposta ${f.status ?? "ok"}${ms}`;
  }
  if (item.source === "audit") return `storico: ${(AUDIT_LABEL[e.slice(6)] ?? e.slice(6)).split(" ")[0]}`;
  const parts = e.split(".");
  if (parts[0] === "wallet" && parts[1] && PROVIDER[parts[1]]) {
    const ok = parts.at(-1) === "ok";
    return `${PROVIDER[parts[1]]} ${ok ? "ok" : `errore${f.http_status ? ` ${f.http_status}` : ""}`}${ms}`;
  }
  if (e === "external.call.ok" || e === "external.call.failed") return null;
  const outcome = parts.at(-1) ?? "";
  const subject = parts.slice(0, -1).join(" ");
  if (outcome === "ok") return `${subject} ok${ms}`;
  if (item.error_code) return `${subject}: ${item.error_code}`;
  return e;
}

/** Riga che dà il titolo al blocco: la prima di dominio (non http), altrimenti la prima. */
function titleOf(items: TimelineItem[]): string {
  const domain = items.find((i) => !i.event.startsWith("http.") && i.source !== "audit");
  const audit = items.find((i) => i.source === "audit");
  return (domain ?? audit ?? items.find((i) => i.event !== "http.request.start") ?? items[0])?.msg ?? "";
}

const worst = (items: TimelineItem[]): LogLevel =>
  items.reduce<LogLevel>((w, i) => (LEVELS[i.level] > LEVELS[w] ? i.level : w), "trace");

/**
 * Raggruppa per request_id (le righe senza request_id restano isolate). Dentro un blocco le righe
 * sono in ordine di tempo; i blocchi sono dal più recente al più vecchio.
 */
export function groupTimeline(items: readonly TimelineItem[]): TimelineBlock[] {
  const sorted = [...items].sort((a, b) => a.ts.localeCompare(b.ts) || a.source.localeCompare(b.source));
  const byRequest = new Map<string, TimelineItem[]>();
  const blocks: Array<{ key: string | null; items: TimelineItem[] }> = [];
  for (const item of sorted) {
    if (!item.request_id) {
      blocks.push({ key: null, items: [item] });
      continue;
    }
    let list = byRequest.get(item.request_id);
    if (!list) {
      list = [];
      byRequest.set(item.request_id, list);
      blocks.push({ key: item.request_id, items: list });
    }
    list.push(item);
  }
  return blocks
    .map(({ key, items: list }) => {
      const seen = new Set<string>();
      const errs: ErrorExplanation[] = [];
      for (const i of list) {
        const x = explainError(i.error_code);
        if (x && !seen.has(x.code)) {
          seen.add(x.code);
          errs.push(x);
        }
      }
      const steps = list.map(stepLabel).filter((s): s is string => s !== null);
      return {
        request_id: key,
        support_code: key ? supportCodeFromRequestId(key) : null,
        ts: list[0]!.ts,
        level: worst(list),
        title: titleOf(list),
        steps: steps.filter((s, i) => s !== steps[i - 1]),
        items: list,
        errors: errs,
      };
    })
    .sort((a, b) => b.ts.localeCompare(a.ts));
}
