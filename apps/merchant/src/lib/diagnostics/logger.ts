import { createLogger, type LogContext, type LogLine } from "@loyalty/shared/logger";
import { app } from "../config";
import { prefs } from "../auth/supabase";
import { EventBuffer } from "./buffer";
import { Sentry, sentryEnabled, setSentryScope } from "./sentry";

/*
 * Logger dell'app: stessi eventi del catalogo e stessa redazione del backend.
 * Ogni riga va nel buffer locale (ultimi 500 eventi, per "Invia diagnostica"); in Sentry gli
 * eventi info diventano breadcrumb, warn ed error diventano eventi con request_id e codice errore.
 */

const BUFFER_KEY = "lw.diagnostica.buffer";

export const buffer = new EventBuffer({
  load: () => prefs.getItem(BUFFER_KEY),
  save: (v) => prefs.setItem(BUFFER_KEY, v),
});

let context: LogContext = { platform: app.platform, app_version: app.version, build: app.build };

/** Aggiorna i campi standard (negozio, utente, ruolo) di tutte le righe successive. */
export function setLogContext(next: { [K in keyof LogContext]?: LogContext[K] | undefined }) {
  const merged: Record<string, unknown> = { ...context, ...next };
  for (const k of Object.keys(merged)) if (merged[k] === undefined) delete merged[k];
  context = merged as LogContext;
  setSentryScope(context);
}

export const getLogContext = () => context;

function toSentry(line: LogLine) {
  if (!sentryEnabled) return;
  if (line.level === "warn" || line.level === "error") {
    Sentry.captureMessage(line.msg, {
      level: line.level === "warn" ? "warning" : "error",
      tags: {
        event: line.event,
        ...(typeof line.error_code === "string" && { error_code: line.error_code }),
        ...(typeof line.request_id === "string" && { request_id: line.request_id }),
      },
      extra: line,
    });
  } else {
    Sentry.addBreadcrumb({ category: line.event, message: line.msg, level: "info", data: line });
  }
}

export const log = createLogger({
  getContext: () => context,
  minLevel: "info",
  format: "pretty",
  sink: (text, line) => {
    buffer.push(line);
    toSentry(line);
    // eslint-disable-next-line no-console -- in sviluppo le righe si leggono anche nel terminale di Metro
    if (__DEV__ && process.env.NODE_ENV !== "test") console.log(text);
  },
});
