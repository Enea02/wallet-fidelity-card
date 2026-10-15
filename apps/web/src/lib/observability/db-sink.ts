import { LEVELS, type LogLine } from "@loyalty/shared/logger";
import { supabaseAdmin } from "../supabase";

/**
 * Copia delle righe di log in Postgres (tabella log_events) per la timeline della vista Assistenza.
 * Le righe (già redatte dal logger) si accumulano in memoria e si scrivono con un solo insert:
 * a fine richiesta (withApi, lavoro verso i wallet) o al più tardi dopo 1 secondo.
 * Se l'insert fallisce la richiesta non ne risente: si registra log.db_sink.failed sul servizio di log.
 * LOG_DB_SINK=on|off; senza valore è attiva tranne che nei test unitari.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_QUEUE = 200;
const FLUSH_DELAY_MS = 1000;

interface Row {
  ts: string;
  level: string;
  event: string;
  msg: string;
  request_id: string | null;
  shop_id: string | null;
  user_id: string | null;
  customer_ref: string | null;
  enrollment_id: string | null;
  error_code: string | null;
  platform: string | null;
  diagnostic: boolean;
  fields: Record<string, unknown>;
}

const str = (v: unknown) => (typeof v === "string" && v !== "" ? v : null);
const uuid = (v: unknown) => (typeof v === "string" && UUID_RE.test(v) ? v : null);

export function dbSinkEnabled(): boolean {
  const v = process.env.LOG_DB_SINK;
  if (v === "on") return true;
  if (v === "off") return false;
  return process.env.NODE_ENV !== "test";
}

export function toRow(line: LogLine): Row {
  return {
    ts: line.ts,
    level: line.level,
    event: line.event,
    msg: line.msg,
    request_id: str(line.request_id),
    shop_id: uuid(line.shop_id),
    user_id: uuid(line.user_id),
    customer_ref: str(line.customer_ref),
    enrollment_id: str(line.enrollment_id),
    error_code: str(line.error_code),
    platform: str(line.platform),
    // sotto info passa solo con la modalità diagnostica attiva: si tiene 7 giorni invece di 30
    diagnostic: LEVELS[line.level] < LEVELS.info,
    fields: line,
  };
}

type FailureReporter = (rows: number, message: string) => void;

let queue: Row[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let inFlight: Promise<void> = Promise.resolve();
let reportFailure: FailureReporter = () => {};

/** Chi registra il fallimento (il logger, che non si può importare qui senza un ciclo). */
export function onDbSinkFailure(fn: FailureReporter): void {
  reportFailure = fn;
}

export function enqueueLogLine(line: LogLine): void {
  if (!dbSinkEnabled() || line.event === "log.db_sink.failed") return;
  queue.push(toRow(line));
  if (queue.length >= MAX_QUEUE) {
    void flushLogs();
  } else if (!timer) {
    timer = setTimeout(() => void flushLogs(), FLUSH_DELAY_MS);
    timer.unref?.();
  }
}

/** Scrive le righe in coda; restituisce quando sono scritte (o il fallimento è registrato). */
export function flushLogs(): Promise<void> {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  const rows = queue;
  queue = [];
  if (rows.length === 0) return inFlight;
  inFlight = inFlight.then(async () => {
    try {
      const { error } = await supabaseAdmin().from("log_events").insert(rows);
      if (error) throw new Error(error.message);
    } catch (e) {
      reportFailure(rows.length, e instanceof Error ? e.message : String(e));
    }
  });
  return inFlight;
}
