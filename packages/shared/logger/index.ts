/**
 * Emettitore minimo di log (Fase 0). Accetta solo eventi del catalogo e scrive
 * una riga per evento: JSON in produzione, testo leggibile in sviluppo.
 * La Fase 1 lo sostituisce con il logger completo (pino, redazione, request_id,
 * modalità diagnostica) mantenendo la stessa firma.
 */
import { events, type EventFields, type EventName, type LogLevel } from "../logging/events";

export interface LogOptions {
  format?: "json" | "pretty";
  write?: (line: string) => void;
  now?: () => Date;
}

export interface LogLine {
  ts: string;
  level: LogLevel;
  event: EventName;
  msg: string;
  [field: string]: unknown;
}

export function buildLogLine<E extends EventName>(event: E, fields: EventFields<E>, now = new Date()): LogLine {
  const def = events[event] as { level: LogLevel; msg: (f: EventFields<E>) => string };
  return { ts: now.toISOString(), level: def.level, event, ...(fields as object), msg: def.msg(fields) };
}

const defaultFormat = (): "json" | "pretty" => (process.env.NODE_ENV === "production" ? "json" : "pretty");

const stream = (level: LogLevel) => (level === "error" || level === "warn" ? process.stderr : process.stdout);

export function logEvent<E extends EventName>(event: E, fields: EventFields<E>, opts: LogOptions = {}): LogLine {
  const line = buildLogLine(event, fields, opts.now?.());
  const format = opts.format ?? defaultFormat();
  const text =
    format === "json"
      ? JSON.stringify(line)
      : `${line.ts.slice(11, 19)} ${line.level.toUpperCase().padEnd(5)} ${line.msg}  [${line.event}]`;
  if (opts.write) opts.write(text);
  else stream(line.level).write(`${text}\n`);
  return line;
}
