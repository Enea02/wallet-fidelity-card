import { AsyncLocalStorage } from "node:async_hooks";
import type { LogContext } from "@loyalty/shared/logger";

/**
 * Contesto della richiesta in corso: ogni riga di log scritta durante la richiesta
 * eredita request_id, route, negozio, utente, piattaforma… senza passarli a mano.
 */
const storage = new AsyncLocalStorage<LogContext>();

export function runWithContext<T>(ctx: LogContext, fn: () => T): T {
  return storage.run({ ...ctx }, fn);
}

export const getContext = (): LogContext | undefined => storage.getStore();

/** Arricchisce il contesto corrente (es. dopo l'autenticazione: shop_id, user_id, role). */
export function setContext(fields: Partial<LogContext>): void {
  const store = storage.getStore();
  if (store) Object.assign(store, fields);
}
