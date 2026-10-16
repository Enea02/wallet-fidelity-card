import "server-only";
import type { LogLevel } from "@loyalty/shared/logging/events";
import {
  auditItem,
  groupTimeline,
  type AuditRow,
  type TimelineBlock,
  type TimelineItem,
} from "@loyalty/shared/support/timeline";
import { supabaseAdmin } from "../supabase";

/*
 * Dati della timeline: log tecnici (log_events), audit di dominio (audit_log) ed eventi dell'app
 * dai pacchetti "Invia diagnostica" (diagnostic_bundles), per un negozio, un cliente, una richiesta
 * o un utente staff. Il raggruppamento e le spiegazioni degli errori sono in @loyalty/shared/support/timeline.
 */

export type Subject =
  | { kind: "negozio"; shopId: string }
  | { kind: "cliente"; customerId: string; shopId: string; shortCode: string }
  | { kind: "tessera"; cardId: string; shopId: string; shortCode: string }
  | { kind: "richiesta"; requestIds: string[] }
  | { kind: "utente staff"; userId: string };

const LIMIT = 600;
const HIDDEN_EVENTS = new Set(["support.timeline.viewed", "support.search"]);
const LOG_COLS = "ts, level, event, msg, request_id, error_code, fields";
const AUDIT_COLS = "ts, request_id, actor_type, actor_id, action, entity, entity_id, before, after, reason, platform";

interface LogRow {
  ts: string;
  level: LogLevel;
  event: string;
  msg: string;
  request_id: string | null;
  error_code: string | null;
  fields: Record<string, unknown>;
}

const logItem = (r: LogRow): TimelineItem => ({
  ts: new Date(r.ts).toISOString(),
  source: "log",
  level: r.level,
  event: r.event,
  msg: r.msg,
  request_id: r.request_id,
  error_code: r.error_code,
  fields: r.fields,
});

interface AppLine {
  ts?: string;
  level?: LogLevel;
  event?: string;
  msg?: string;
  request_id?: string;
  error_code?: string;
  [k: string]: unknown;
}

/** Righe dell'app da un pacchetto di diagnostica (solo quelle con data e messaggio). */
export function appItems(bundle: { ticket_code: string; events: unknown }): TimelineItem[] {
  const list = Array.isArray(bundle.events) ? (bundle.events as AppLine[]) : [];
  return list
    .filter((e) => typeof e.ts === "string" && typeof e.msg === "string")
    .map((e) => ({
      ts: new Date(e.ts!).toISOString(),
      source: "app" as const,
      level: e.level ?? "info",
      event: e.event ?? "app",
      msg: `App: ${e.msg}`,
      request_id: typeof e.request_id === "string" ? e.request_id : null,
      error_code: typeof e.error_code === "string" ? e.error_code : null,
      fields: { ...e, ticket: bundle.ticket_code },
    }));
}

const chunks = <T>(list: T[], n: number) =>
  Array.from({ length: Math.ceil(list.length / n) }, (_, i) => list.slice(i * n, i * n + n));

async function logsByRequests(ids: string[]): Promise<LogRow[]> {
  const db = supabaseAdmin();
  const out: LogRow[] = [];
  for (const part of chunks([...new Set(ids)], 100)) {
    const { data, error } = await db.from("log_events").select(LOG_COLS).in("request_id", part).limit(LIMIT);
    if (error) throw error;
    out.push(...((data ?? []) as LogRow[]));
  }
  return out;
}

/** Nome dello staff per le righe di audit (actor_id è l'id dell'utente). */
async function staffNames(audit: AuditRow[]): Promise<Map<string, string>> {
  const ids = [...new Set(audit.filter((r) => r.actor_type === "staff" && r.actor_id).map((r) => r.actor_id!))];
  if (ids.length === 0) return new Map();
  const { data, error } = await supabaseAdmin().from("staff").select("user_id, display_name, role").in("user_id", ids);
  if (error) throw error;
  return new Map(
    (data ?? []).map((m) => [
      m.user_id as string,
      `${m.display_name as string} (${m.role === "owner" ? "titolare" : "operatore"})`,
    ]),
  );
}

export async function loadTimeline(subject: Subject, days = 14): Promise<{ blocks: TimelineBlock[]; rows: number }> {
  const db = supabaseAdmin();
  const since = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
  let logs: LogRow[];
  let audit: AuditRow[];
  let bundles: Array<{ ticket_code: string; events: unknown }> = [];

  if (subject.kind === "negozio") {
    const [l, a, b] = await Promise.all([
      db
        .from("log_events")
        .select(LOG_COLS)
        .eq("shop_id", subject.shopId)
        .gte("ts", since)
        .order("ts", { ascending: false })
        .limit(LIMIT),
      db
        .from("audit_log")
        .select(AUDIT_COLS)
        .eq("shop_id", subject.shopId)
        .gte("ts", since)
        .order("ts", { ascending: false })
        .limit(LIMIT),
      db
        .from("diagnostic_bundles")
        .select("ticket_code, events")
        .eq("shop_id", subject.shopId)
        .gte("created_at", since)
        .limit(20),
    ]);
    for (const r of [l, a, b]) if (r.error) throw r.error;
    logs = l.data as LogRow[];
    audit = a.data as AuditRow[];
    bundles = b.data ?? [];
  } else if (subject.kind === "cliente" || subject.kind === "tessera") {
    const [l, a] = await Promise.all([
      db
        .from("log_events")
        .select(LOG_COLS)
        .eq("customer_ref", subject.shortCode)
        .gte("ts", since)
        .order("ts", { ascending: false })
        .limit(LIMIT),
      db
        .from("audit_log")
        .select(AUDIT_COLS)
        .eq("entity", subject.kind === "tessera" ? "prepaid_card" : "customer")
        .eq("entity_id", subject.kind === "tessera" ? subject.cardId : subject.customerId)
        .order("ts", { ascending: false })
        .limit(LIMIT),
    ]);
    for (const r of [l, a]) if (r.error) throw r.error;
    const direct = l.data as LogRow[];
    audit = a.data as AuditRow[];
    // righe delle stesse richieste senza il codice della carta (inizio e fine della chiamata, Google…)
    const ids = [...direct, ...audit].map((r) => r.request_id).filter((id): id is string => !!id);
    logs = await logsByRequests(ids);
    const seen = new Set(logs.map((r) => `${r.ts}|${r.event}|${r.msg}`));
    for (const r of direct) if (!seen.has(`${r.ts}|${r.event}|${r.msg}`)) logs.push(r);
  } else if (subject.kind === "richiesta") {
    const [l, a, b] = await Promise.all([
      logsByRequests(subject.requestIds),
      db.from("audit_log").select(AUDIT_COLS).in("request_id", subject.requestIds).limit(LIMIT),
      Promise.all(
        subject.requestIds.map((id) =>
          db
            .from("diagnostic_bundles")
            .select("ticket_code, events")
            .contains("events", JSON.stringify([{ request_id: id }]))
            .limit(5),
        ),
      ),
    ]);
    if (a.error) throw a.error;
    logs = l;
    audit = a.data as AuditRow[];
    bundles = b.flatMap((r) => r.data ?? []);
  } else {
    const [l, a, b] = await Promise.all([
      db
        .from("log_events")
        .select(LOG_COLS)
        .eq("user_id", subject.userId)
        .gte("ts", since)
        .order("ts", { ascending: false })
        .limit(LIMIT),
      db
        .from("audit_log")
        .select(AUDIT_COLS)
        .eq("actor_id", subject.userId)
        .gte("ts", since)
        .order("ts", { ascending: false })
        .limit(LIMIT),
      db
        .from("diagnostic_bundles")
        .select("ticket_code, events")
        .eq("user_id", subject.userId)
        .gte("created_at", since)
        .limit(20),
    ]);
    for (const r of [l, a, b]) if (r.error) throw r.error;
    logs = l.data as LogRow[];
    audit = a.data as AuditRow[];
    bundles = b.data ?? [];
  }

  let app = bundles.flatMap(appItems);
  if (subject.kind === "richiesta") app = app.filter((i) => i.request_id && subject.requestIds.includes(i.request_id));
  // le consultazioni dell'assistenza (ricerche, timeline aperte) sono tracciate ma qui sarebbero solo rumore
  logs = logs.filter((r) => !HIDDEN_EVENTS.has(r.event));
  const names = await staffNames(audit);
  const items = [
    ...logs.map(logItem),
    ...audit.map((r) =>
      auditItem(
        { ...r, ts: new Date(r.ts).toISOString() },
        r.actor_type === "staff" ? names.get(r.actor_id ?? "") : undefined,
      ),
    ),
    ...app,
  ];
  return { blocks: groupTimeline(items), rows: items.length };
}
