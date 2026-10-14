/**
 * Redazione automatica: applicata a OGNI riga di log prima che esca dal processo.
 * Regole (requisito "Privacy e sicurezza dei log" del brief):
 * - per nome del campo: token, chiavi, password, OTP, header Authorization/Cookie → "[REDATTO]";
 *   qr_token → solo i primi 4 caratteri; telefono → mascherato (+39 333 ***4567);
 * - per contenuto, in qualsiasi stringa (anche dentro `msg` o nel body di un provider):
 *   JWT, "Bearer …", chiavi Supabase, chiavi private PEM, numeri di telefono, qr_token (32 hex).
 */
export const REDACTED = "[REDATTO]";

const MAX_DEPTH = 8;

/** Nomi normalizzati (minuscolo, senza "_" "-") da redigere sempre. */
const SECRET_KEYS = new Set([
  "authorization",
  "proxyauthorization",
  "cookie",
  "setcookie",
  "password",
  "passwd",
  "otp",
  "otpcode",
  "jwt",
  "apikey",
  "privatekey",
  "credentials",
  "authenticationtoken",
  "pushtoken",
]);
const SECRET_SUFFIXES = ["token", "secret", "password", "apikey", "privatekey", "keyb64", "salt"];
const QR_KEYS = new Set(["qrtoken", "qr"]);
const PHONE_KEYS = new Set(["phone", "telefono", "phonenumber", "tel", "mobile"]);
const EMAIL_KEYS = new Set(["email", "mail"]);

const normalizeKey = (k: string) => k.toLowerCase().replace(/[_-]/g, "");

function keyKind(key: string): "secret" | "qr" | "phone" | "email" | null {
  const k = normalizeKey(key);
  if (QR_KEYS.has(k)) return "qr";
  if (PHONE_KEYS.has(k)) return "phone";
  if (EMAIL_KEYS.has(k)) return "email";
  if (SECRET_KEYS.has(k) || SECRET_SUFFIXES.some((s) => k.endsWith(s))) return "secret";
  return null;
}

/** "+39 333 1234567" → "+39 333 ***4567". Accetta qualsiasi formattazione. */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 6) return "***";
  const last4 = digits.slice(-4);
  if (digits.startsWith("39") && digits.length >= 11) return `+39 ${digits.slice(2, 5)} ***${last4}`;
  return `+${digits.slice(0, 2)} ***${last4}`;
}

/** "giulia.rossi@salone.it" → "gi***@salone.it". */
export function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at < 1) return "***";
  return `${email.slice(0, Math.min(2, at))}***${email.slice(at)}`;
}

export const maskQrToken = (token: string): string => `${token.slice(0, 4)}…`;

const VALUE_RULES: Array<[RegExp, (match: string) => string]> = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(-----END [A-Z ]*PRIVATE KEY-----|$)/g, () => REDACTED],
  [/\beyJ[\w-]{5,}\.[\w-]{5,}\.[\w-]*/g, () => "[JWT REDATTO]"],
  [/\b(Bearer|Basic)\s+[\w.~+/=-]+/gi, (m) => `${m.split(/\s+/)[0]} ${REDACTED}`],
  [/\bsb_(secret|publishable)_[\w-]+/g, () => REDACTED],
  [/\b[0-9a-f]{32}\b/g, (m) => maskQrToken(m)],
  // telefono: "+" seguito da 8-15 cifre, con spazi/punti/trattini opzionali
  [/\+\d(?:[\s.-]?\d){7,14}\b/g, (m) => maskPhone(m)],
];

export function redactString(value: string): string {
  let out = value;
  for (const [re, replace] of VALUE_RULES) out = out.replace(re, replace);
  return out;
}

function redactValue(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (typeof value === "string") return redactString(value);
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) return "[circolare]";
  if (depth >= MAX_DEPTH) return "[troppo annidato]";
  seen.add(value);

  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactString(value.message),
      ...(value.stack !== undefined && { stack: redactString(value.stack) }),
    };
  }
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((v) => redactValue(v, depth + 1, seen));
  if (typeof Headers !== "undefined" && value instanceof Headers) {
    return redactValue(Object.fromEntries(value.entries()), depth, seen);
  }

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    const kind = keyKind(k);
    if (kind === "secret" && v !== null && v !== undefined && v !== "") out[k] = REDACTED;
    else if (kind === "qr" && typeof v === "string") out[k] = maskQrToken(v);
    else if (kind === "phone" && typeof v === "string") out[k] = maskPhone(v);
    else if (kind === "email" && typeof v === "string") out[k] = maskEmail(v);
    else out[k] = redactValue(v, depth + 1, seen);
  }
  return out;
}

/** Copia redatta di qualsiasi valore (oggetti, array, errori, stringhe). Non modifica l'originale. */
export function redact<T>(value: T): T {
  return redactValue(value, 0, new WeakSet()) as T;
}
