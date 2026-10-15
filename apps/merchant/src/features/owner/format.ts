/*
 * Testi dell'area titolare (design Titolare): date in italiano, variazioni settimanali,
 * descrizioni dello storico di una carta. Puri, testati in format.test.ts.
 */

const TZ = "Europe/Rome";
const dayMonth = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short", timeZone: TZ });
const dayMonthLong = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long", timeZone: TZ });
const time = new Intl.DateTimeFormat("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
const year = new Intl.DateTimeFormat("it-IT", { year: "numeric", timeZone: TZ });

/** "12 ago" (con l'anno se non è quello corrente: "12 ago 2025"). */
export function shortDate(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const base = dayMonth.format(d).replace(".", "");
  return year.format(d) === year.format(now) ? base : `${base} ${year.format(d)}`;
}

/** "12 agosto". */
export const longDate = (iso: string) => dayMonthLong.format(new Date(iso));

/** "10 ott · 10:12". */
export const dateTime = (iso: string, now = new Date()) => `${shortDate(iso, now)} · ${time.format(new Date(iso))}`;

/** "Settimana 5–11 ottobre" dal lunedì (YYYY-MM-DD). */
export function weekRange(weekStart: string): string {
  const start = new Date(`${weekStart}T12:00:00Z`);
  const end = new Date(start.getTime() + 6 * 86_400_000);
  const sameMonth = start.getUTCMonth() === end.getUTCMonth();
  const endText = dayMonthLong.format(end);
  return sameMonth ? `${start.getUTCDate()}–${endText}` : `${dayMonthLong.format(start)} – ${endText}`;
}

/** Variazione rispetto alla settimana prima: "+11 sulla settimana scorsa", "uguale alla settimana scorsa". */
export function weekDelta(now: number, before: number): string {
  const d = now - before;
  if (d === 0) return "uguale alla settimana scorsa";
  return `${d > 0 ? "+" : "−"}${Math.abs(d)} sulla settimana scorsa`;
}

export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Saluto del design ("Buongiorno, Nora"). */
export const greeting = (h: number) => (h < 13 ? "Buongiorno" : h < 18 ? "Buon pomeriggio" : "Buonasera");

/* ---------- storico della carta ---------- */

export interface HistoryInput {
  at: string;
  action: string;
  actorName: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  reason: string | null;
}

export interface HistoryLine {
  what: string;
  meta: string;
  /** Variazione dei timbri: "+1", "−10", "0", oppure "" se non riguarda il saldo. */
  delta: string;
}

const num = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0));

/** Una riga dello storico come nel design T3: "Correzione · Timbro dimenticato", "30 ago · Nora", "+1". */
export function historyLine(h: HistoryInput, rewardLabel: string, now = new Date()): HistoryLine {
  const who = h.actorName === "cliente" ? "dal cliente" : h.actorName;
  const meta = (extra?: string) => [dateTime(h.at, now), extra ?? who].filter(Boolean).join(" · ");
  const stamps = (o: Record<string, unknown> | null) => num(o?.stamps);
  const rewards = (o: Record<string, unknown> | null) => num(o?.rewards_available);
  const signed = (d: number) => (d > 0 ? `+${d}` : d < 0 ? `−${Math.abs(d)}` : "0");
  switch (h.action) {
    case "enroll":
      return { what: "Iscrizione", meta: meta("dalla pagina del negozio"), delta: "0" };
    case "stamp":
      return {
        what: h.after?.forced
          ? "Timbro · forzato durante il cooldown"
          : h.after?.reward_unlocked
            ? "Timbro · premio sbloccato"
            : "Timbro",
        meta: meta(),
        delta: "+1",
      };
    case "undo":
      return { what: "Timbro annullato", meta: meta(), delta: "−1" };
    case "redeem":
      return { what: `Premio riscattato · ${rewardLabel}`, meta: meta(), delta: `−1 premio` };
    case "adjust": {
      const ds = stamps(h.after) - stamps(h.before);
      const dr = rewards(h.after) - rewards(h.before);
      const parts = [ds !== 0 ? `${signed(ds)} timbri` : "", dr !== 0 ? `${signed(dr)} premi` : ""].filter(Boolean);
      return {
        what: `Correzione${h.reason ? ` · ${h.reason}` : ""}`,
        meta: meta(),
        delta: parts.length
          ? parts
              .join(", ")
              .replace(/^\+1 timbri/, "+1 timbro")
              .replace(/^−1 timbri/, "−1 timbro")
          : "0",
      };
    }
    case "marketing_consent":
      return {
        what: h.after?.consent_marketing ? "Consenso alle promozioni dato" : "Consenso alle promozioni revocato",
        meta: meta(),
        delta: "",
      };
    case "customer_delete":
      return { what: "Carta cancellata", meta: meta(), delta: "" };
    default:
      return { what: h.action, meta: meta(), delta: "" };
  }
}

/** "oggi", "ieri", "2 giorni fa", "3 settimane fa" (per inviti e ultimi invii). */
export function ago(iso: string, now = new Date()): string {
  const days = Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "oggi";
  if (days === 1) return "ieri";
  if (days < 14) return `${days} giorni fa`;
  return `${Math.floor(days / 7)} settimane fa`;
}

/** Limite delle promozioni: una a settimana (dal backend, E_PROMO_WEEKLY_LIMIT). */
export function nextPromoAllowed(lastCreatedAt: string | null, now = new Date()): Date | null {
  if (!lastCreatedAt) return null;
  const next = new Date(new Date(lastCreatedAt).getTime() + 7 * 86_400_000);
  return next > now ? next : null;
}
