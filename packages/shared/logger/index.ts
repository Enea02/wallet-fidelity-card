/**
 * Logger condiviso. Accetta solo eventi del catalogo (packages/shared/logging/events.ts)
 * con i loro campi, aggiunge i campi standard dal contesto, applica la redazione a tutta
 * la riga e la scrive: JSON in produzione (una riga per evento), testo leggibile in sviluppo.
 *
 * È indipendente dalla piattaforma: contesto della richiesta, livello minimo (che può
 * dipendere dalla modalità diagnostica) e destinazione sono forniti da chi lo crea.
 */
import { events, type EventFields, type EventName, type LogLevel } from "../logging/events";
import { supportCodeFromRequestId } from "../logging/request-id";
import { redact } from "./redact";

export { maskPhone, maskQrToken, redact, redactString, REDACTED } from "./redact";

export const LEVELS: Record<LogLevel, number> = { trace: 10, debug: 20, info: 30, warn: 40, error: 50 };

/** Campi standard, con gli stessi nomi su backend, app, web e Sentry. */
export interface LogContext {
  request_id?: string;
  route?: string;
  method?: string;
  shop_id?: string;
  user_id?: string;
  role?: string;
  platform?: string;
  app_version?: string;
  build?: string;
  customer_ref?: string;
  /** Hash con salt dell'IP del client (mai l'IP in chiaro). */
  ip_hash?: string;
}

export interface LogLine {
  ts: string;
  level: LogLevel;
  event: EventName;
  msg: string;
  [field: string]: unknown;
}

export type LogFormat = "json" | "pretty";
export type LogSink = (text: string, line: LogLine) => void;

export interface LoggerOptions {
  /** Contesto della richiesta in corso (request_id, shop_id, …). */
  getContext?: () => LogContext | undefined;
  /** Livello minimo; può dipendere dal contesto (modalità diagnostica). Default: info. */
  minLevel?: LogLevel | ((ctx: LogContext) => LogLevel);
  format?: LogFormat;
  sink?: LogSink;
  /** Campi fissi aggiunti a ogni riga (es. app, env). */
  base?: Record<string, unknown>;
  now?: () => Date;
}

export interface EventOptions {
  /** Sostituisce il livello di default del catalogo (es. warn per una richiesta rifiutata). */
  level?: LogLevel;
  /** Errore da allegare come `error: { name, message, stack }`. */
  error?: unknown;
}

export interface Logger {
  event<E extends EventName>(event: E, fields: EventFields<E>, opts?: EventOptions): LogLine | null;
  isEnabled(level: LogLevel): boolean;
}

export const stdoutSink: LogSink = (text, line) => {
  const stream = LEVELS[line.level] >= LEVELS.warn ? process.stderr : process.stdout;
  stream.write(`${text}\n`);
};

const timeFmt = new Intl.DateTimeFormat("it-IT", {
  timeZone: "Europe/Rome",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

export function formatLine(line: LogLine, format: LogFormat): string {
  if (format === "json") return JSON.stringify(line);
  const ref = typeof line.request_id === "string" ? ` · ${supportCodeFromRequestId(line.request_id)}` : "";
  const head = `${timeFmt.format(new Date(line.ts))} ${line.level.toUpperCase().padEnd(5)} ${line.msg}  [${line.event}${ref}]`;
  const err = line.error as { stack?: string } | undefined;
  return err?.stack ? `${head}\n${err.stack}` : head;
}

function serializeError(e: unknown): Record<string, unknown> {
  if (e instanceof Error) {
    const cause = e.cause === undefined ? {} : { cause: serializeError(e.cause) };
    return { name: e.name, message: e.message, ...(e.stack !== undefined && { stack: e.stack }), ...cause };
  }
  if (e !== null && typeof e === "object") return { ...(e as Record<string, unknown>) };
  return { message: String(e) };
}

export function createLogger(opts: LoggerOptions = {}): Logger {
  const now = opts.now ?? (() => new Date());
  const format = opts.format ?? "json";
  const sink = opts.sink ?? stdoutSink;
  const getContext = opts.getContext ?? (() => undefined);

  const minLevelFor = (ctx: LogContext): LogLevel => {
    const m = opts.minLevel ?? "info";
    return typeof m === "function" ? m(ctx) : m;
  };

  const isEnabled = (level: LogLevel) => LEVELS[level] >= LEVELS[minLevelFor(getContext() ?? {})];

  return {
    isEnabled,
    event(event, fields, eventOpts = {}) {
      const def = events[event] as { level: LogLevel; msg: (f: typeof fields) => string };
      const level = eventOpts.level ?? def.level;
      const ctx = getContext() ?? {};
      if (LEVELS[level] < LEVELS[minLevelFor(ctx)]) return null;

      const context = Object.fromEntries(Object.entries(ctx).filter(([, v]) => v !== undefined));
      const raw: LogLine = {
        ts: now().toISOString(),
        level,
        event,
        ...opts.base,
        ...context,
        ...(fields as object),
        ...(eventOpts.error !== undefined && { error: serializeError(eventOpts.error) }),
        msg: def.msg(fields),
      };
      const line = redact(raw);
      sink(formatLine(line, format), line);
      return line;
    },
  };
}
