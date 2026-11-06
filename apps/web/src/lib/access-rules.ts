import type { AuthDestination, AuthLoginNext } from "@loyalty/shared/logging/events";

/*
 * Regole del login unico (/accesso), senza I/O: chi va dove dopo la password e dopo il codice.
 * - team interno: sempre il secondo fattore (collegamento al primo accesso, poi il codice);
 * - solo staff di un negozio: subito la web app esercente;
 * - team e staff: schermata di scelta, salvo che stesse già aprendo una delle due.
 */

export interface Access {
  /** Nel team interno (support_members attivo). */
  team: boolean;
  /** Negozi in cui è nello staff. */
  shops: number;
}

export const hasAnyAccess = (a: Access) => a.team || a.shops > 0;

/** Destinazione richiesta dal parametro ?dest= (la pagina che si stava aprendo), null se assente o sconosciuta. */
export function parseDest(value: unknown): AuthDestination | null {
  return value === "interno" || value === "app" ? value : null;
}

/** Passo dopo la password corretta (chi non ha nessun accesso è già stato fermato). */
export function nextAfterPassword(a: Access, hasVerifiedFactor: boolean): AuthLoginNext {
  if (a.team) return hasVerifiedFactor ? "codice" : "collega";
  return "app";
}

export type Destination =
  | { kind: "go"; destination: AuthDestination; how: "unico accesso" | "scelta" | "pagina richiesta" }
  | { kind: "scegli" };

/**
 * Dove entra chi ha completato il login (per il team: anche il codice). `wanted` è la pagina che
 * stava aprendo: vale solo se ne ha diritto.
 */
export function destinationFor(a: Access, wanted: AuthDestination | null): Destination {
  const canPanel = a.team;
  const canApp = a.shops > 0;
  if (wanted === "interno" && canPanel) return { kind: "go", destination: "interno", how: "pagina richiesta" };
  if (wanted === "app" && canApp) return { kind: "go", destination: "app", how: "pagina richiesta" };
  if (canPanel && canApp) return { kind: "scegli" };
  return { kind: "go", destination: canPanel ? "interno" : "app", how: "unico accesso" };
}

/**
 * Indirizzo a cui tornare dopo il login (?ritorno=), solo se è della web app esercente: sul sito
 * sotto `appPath`, oppure su un'altra origine ammessa (es. l'app con ricarica a caldo su :8081 in
 * sviluppo). Tutto il resto è ignorato: niente redirect verso siti di terzi.
 */
export function safeReturnUrl(
  value: unknown,
  opts: { siteOrigin: string | null; extraOrigins: string[]; appPath: string },
): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > 2000) return null;
  const base = opts.siteOrigin ?? "http://sito.invalid";
  if (!URL.canParse(value, base)) return null;
  const url = new URL(value, base);
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (opts.siteOrigin && url.origin === opts.siteOrigin) {
    const inApp = url.pathname === opts.appPath || url.pathname.startsWith(`${opts.appPath}/`);
    return inApp ? `${url.pathname}${url.search}` : null;
  }
  return opts.extraOrigins.includes(url.origin) ? url.toString() : null;
}
