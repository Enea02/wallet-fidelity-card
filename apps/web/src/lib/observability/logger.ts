import { createLogger, stdoutSink, type LogFormat, type LogSink } from "@loyalty/shared/logger";
import type { LogLevel } from "@loyalty/shared/logging/events";
import { getContext } from "./context";
import { diagnosticLevelFor } from "./diagnostic-state";

/**
 * Logger del server web. Destinazione: stdout, che Vercel inoltra al servizio di log
 * esterno tramite Log Drain (Axiom). LOG_TRANSPORT=none spegne l'output (test).
 * Le variabili sono lette in modo tollerante: il logger serve anche a segnalare
 * una configurazione non valida all'avvio.
 */
const LEVELS: readonly LogLevel[] = ["trace", "debug", "info", "warn", "error"];

function baseLevel(): LogLevel {
  const v = process.env.LOG_LEVEL as LogLevel | undefined;
  return v && LEVELS.includes(v) ? v : "info";
}

function format(): LogFormat {
  const v = process.env.LOG_FORMAT;
  if (v === "json" || v === "pretty") return v;
  return process.env.NODE_ENV === "production" ? "json" : "pretty";
}

let sink: LogSink = process.env.LOG_TRANSPORT === "none" ? () => {} : stdoutSink;

/** Cambia la destinazione delle righe (usato dai test per catturarle). */
export function setLogSink(next: LogSink): void {
  sink = next;
}

export const log = createLogger({
  getContext,
  minLevel: (ctx) => diagnosticLevelFor(ctx, baseLevel()),
  format: format(),
  sink: (text, line) => sink(text, line),
  base: {
    app: "web",
    env: process.env.APP_ENV ?? "development",
    ...(process.env.APP_VERSION !== undefined && { version: process.env.APP_VERSION }),
    ...(process.env.APP_COMMIT_SHA !== undefined && { commit: process.env.APP_COMMIT_SHA }),
  },
});
