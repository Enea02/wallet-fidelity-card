/*
 * Web app esercente: servita da questo stesso server sotto /app (export di apps/merchant copiato
 * in public/app, vedi next.config.ts). Stesso dominio del sito e del pannello interno.
 */

/** Prefisso della web app esercente sul sito. */
export const MERCHANT_APP_PATH = "/app";

/** URL della web app esercente per i link nelle email (inviti, recupero password): MERCHANT_APP_URL o APP_BASE_URL/app. */
export function merchantAppUrl(): string {
  const explicit = process.env.MERCHANT_APP_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  const base = (process.env.APP_BASE_URL ?? "").replace(/\/+$/, "");
  return `${base}${MERCHANT_APP_PATH}`;
}

/** Origine del sito (APP_BASE_URL), null se non configurata o non valida. */
export function siteOrigin(): string | null {
  const base = process.env.APP_BASE_URL;
  if (!base || !URL.canParse(base)) return null;
  return new URL(base).origin;
}
