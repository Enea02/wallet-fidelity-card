/*
 * Web: l'app esercente è servita sotto un prefisso (/app) dallo stesso server del sito e del
 * pannello interno. Il prefisso arriva da experiments.baseUrl (app.config.ts) e, come fa
 * expo-router, vale solo fuori dallo sviluppo: con `expo start` in modalità dev l'app sta alla radice.
 */
const raw = process.env.NODE_ENV !== "development" ? (process.env.EXPO_BASE_URL ?? "") : "";

/** Prefisso dell'app sul web, senza "/" finale ("" se servita alla radice). */
export const WEB_BASE = raw.replace(/\/+$/, "");

/** Percorso pubblico di un file dell'app (es. "/zxing/x.wasm" → "/app/zxing/x.wasm"). */
export const withBase = (path: string): string => `${WEB_BASE}${path.startsWith("/") ? path : `/${path}`}`;

/** Percorso del router a partire da quello del browser ("/app/clienti" → "/clienti"). */
export function stripBase(pathname: string): string {
  if (!WEB_BASE) return pathname;
  if (pathname === WEB_BASE) return "/";
  return pathname.startsWith(`${WEB_BASE}/`) ? pathname.slice(WEB_BASE.length) : pathname;
}
