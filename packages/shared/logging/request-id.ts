/**
 * request_id (ULID) e codice assistenza.
 *
 * Il request_id è un ULID: 10 caratteri di tempo (ms) + 16 casuali, alfabeto Crockford base32.
 * Il codice assistenza è `ERR-` + i caratteri 5–9 del request_id (es. 01JB7K3QX… → ERR-7K3QX):
 * fissano l'istante con una precisione di 32 ms dentro un ciclo di ~12,4 giorni, quindi nella
 * retention dei log (30 giorni) corrisponde a 3-4 prefissi di request_id, uno per ciclo.
 * Funziona ovunque (server, browser, React Native): usa solo crypto.getRandomValues.
 */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const TIME_LEN = 10;
const RANDOM_LEN = 16;
const REQUEST_ID_RE = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/;
const SUPPORT_CODE_RE = /^ERR-([0-9A-HJKMNP-TV-Z]{5})$/;

/** Peso in ms del carattere di tempo in posizione i (0 = più significativo). */
const weight = (i: number) => 32 ** (TIME_LEN - 1 - i);
/** Ampiezza in ms di un ciclo del codice assistenza (= peso del carattere in posizione 3). */
export const SUPPORT_CODE_CYCLE_MS = weight(3);

function encodeTime(ms: number): string {
  let out = "";
  let t = ms;
  for (let i = 0; i < TIME_LEN; i++) {
    out = ALPHABET.charAt(t % 32) + out;
    t = Math.floor(t / 32);
  }
  return out;
}

function decodeTime(chars: string): number {
  let ms = 0;
  for (const c of chars) ms = ms * 32 + ALPHABET.indexOf(c);
  return ms;
}

export function newRequestId(now: number = Date.now()): string {
  const bytes = new Uint8Array(RANDOM_LEN);
  crypto.getRandomValues(bytes);
  let random = "";
  for (const b of bytes) random += ALPHABET.charAt(b % 32);
  return encodeTime(now) + random;
}

export const isRequestId = (value: string): boolean => REQUEST_ID_RE.test(value);

/** Istante (ms) codificato nel request_id. */
export const requestIdTime = (requestId: string): number => decodeTime(requestId.slice(0, TIME_LEN));

export function supportCodeFromRequestId(requestId: string): string {
  return `ERR-${requestId.slice(4, 9)}`;
}

export function normalizeSupportCode(input: string): string | null {
  // tollera minuscole, spazi e le lettere che Crockford confonde (O→0, I/L→1)
  const s = input
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/^ERR-?/, "ERR-");
  const code = s.startsWith("ERR-") ? s : `ERR-${s}`;
  const fixed = code.slice(0, 4) + code.slice(4).replace(/O/g, "0").replace(/[IL]/g, "1");
  return SUPPORT_CODE_RE.test(fixed) ? fixed : null;
}

export interface RequestIdCandidate {
  /** Prefisso (9 caratteri) che i request_id di questo codice hanno in questo ciclo. */
  prefix: string;
  /** Finestra di 32 ms in cui è iniziata la richiesta. */
  from: Date;
  to: Date;
}

/**
 * Funzione inversa del codice assistenza: i prefissi di request_id compatibili
 * con il codice nella finestra di tempo data (default: ultimi 30 giorni).
 * Nella ricerca: `request_id LIKE '<prefix>%'` per ciascun candidato.
 */
export function requestIdCandidatesFromSupportCode(
  supportCode: string,
  window: { from?: Date; to?: Date } = {},
): RequestIdCandidate[] {
  const code = normalizeSupportCode(supportCode);
  if (!code) return [];
  const to = (window.to ?? new Date()).getTime();
  const from = (window.from ?? new Date(to - 30 * 24 * 3600 * 1000)).getTime();
  const tail = code.slice(4);

  const out: RequestIdCandidate[] = [];
  for (let cycle = Math.floor(from / SUPPORT_CODE_CYCLE_MS); cycle * SUPPORT_CODE_CYCLE_MS <= to; cycle++) {
    const prefix = encodeTime(cycle * SUPPORT_CODE_CYCLE_MS).slice(0, 4) + tail;
    const start = decodeTime(`${prefix}0`);
    const end = start + weight(8) - 1;
    if (end >= from && start <= to) out.push({ prefix, from: new Date(start), to: new Date(end) });
  }
  return out;
}
