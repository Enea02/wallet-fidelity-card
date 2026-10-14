import { ShortCode } from "@loyalty/shared/api";

/*
 * Cosa ha letto lo scanner: il QR della carta (32 caratteri esadecimali, il valore del codice
 * nel wallet) oppure il codice breve stampato sotto il QR (8 caratteri, senza 0/O/1/I/L).
 * Tutto il resto si scarta senza chiamare il server, con un motivo leggibile per il log.
 */

export type Parsed = { ok: true; kind: "QR" | "codice breve"; code: string } | { ok: false; reason: string };

const QR_RE = /^[0-9a-f]{32}$/i;

/** Il codice breve dettato o digitato: maiuscole, senza spazi né trattini. */
export const normalizeShortCode = (s: string) => s.toUpperCase().replace(/[\s-]/g, "");

export function parseCode(raw: string): Parsed {
  const s = raw.trim();
  if (QR_RE.test(s)) return { ok: true, kind: "QR", code: s.toLowerCase() };
  const short = normalizeShortCode(s);
  if (ShortCode.safeParse(short).success) return { ok: true, kind: "codice breve", code: short };
  return { ok: false, reason: describe(s) };
}

function describe(s: string): string {
  if (s === "") return "lettura vuota";
  if (/^https?:\/\//i.test(s)) return "URL di un sito";
  if (/^[0-9]{8,14}$/.test(s)) return `codice a barre numerico di ${s.length} cifre`;
  return `testo di ${s.length} caratteri`;
}

/**
 * La fotocamera legge lo stesso QR decine di volte al secondo: una lettura uguale entro
 * `windowMs` si ignora. Un codice diverso passa subito.
 */
export function createDedupe(windowMs = 3000, now: () => number = () => Date.now()) {
  let last = "";
  let at = 0;
  return {
    accept(code: string): boolean {
      const t = now();
      if (code === last && t - at < windowMs) return false;
      last = code;
      at = t;
      return true;
    },
    reset() {
      last = "";
      at = 0;
    },
    /** Tratta `code` come appena letto: tornando allo scanner la carta di prima non si riapre subito. */
    hold(code: string) {
      last = code;
      at = now();
    },
  };
}
