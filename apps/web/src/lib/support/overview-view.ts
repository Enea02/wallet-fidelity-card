/*
 * Pannello interno: dati della Panoramica, delle card dei negozi e della scheda negozio
 * (funzioni Postgres support_*_overview) e le frasi che li descrivono. Solo logica pura:
 * le letture sono in overview.ts.
 */

export type IssueKind = "sync" | "ticket" | "invito" | "inattivo" | "diagnostica" | "sospeso";

export interface Issue {
  kind: IssueKind;
  since: string | null;
  detail: Record<string, unknown>;
}

export interface WatchItem extends Issue {
  shop_id: string;
  shop_name: string;
}

export interface NetworkOverview {
  days: number;
  shops_active: number;
  shops_suspended: number;
  shops_new_30: number;
  customers: number;
  customers_new: number;
  activity: number;
  activity_prev: number;
  enroll_started: number;
  enroll_verified: number;
  errors_24h: number;
  errors_top: Array<{ code: string; count: number }>;
  unsynced_cards: number;
  unsynced_shops: string[];
  problem_shops: number;
  open_tickets: number;
  watch: WatchItem[];
  services: {
    google_calls: number;
    google_failed: number;
    sms_sent: number;
    sms_failed: number;
    blocked_numbers: number;
    queue_pending: number;
    queue_exhausted: number;
    cron_last_at: string | null;
  };
  series: Array<{ day: string; activity: number; enrollments: number; errors: number }>;
  top_shops: Array<{ shop_id: string; name: string; count: number }>;
  changes: Array<{
    ts: string;
    actor_type: string;
    actor_id: string | null;
    actor_name: string | null;
    action: string;
    reason: string | null;
    shop_id: string | null;
    shop_name: string | null;
  }>;
}

export interface ShopCard {
  id: string;
  slug: string;
  name: string;
  status: "active" | "suspended";
  created_at: string;
  hex_color: string;
  loyalty_enabled: boolean;
  loyalty_mode: "timbri" | "punti";
  stamps_required: number;
  reward_label: string;
  points_per_euro: number;
  levels: number;
  prepaid_kinds: Array<"consumo" | "abbonamento">;
  customers: number;
  customers_new_7: number;
  activity_7: number;
  staff: number;
  owner: string | null;
  owner_email: string | null;
  vat_number: string | null;
  spark: number[];
  issues: Issue[];
}

export interface ShopOverview {
  customers: number;
  customers_new_7: number;
  activity_7: number;
  activity_prev_7: number;
  redeems_30: number;
  visitors_60: number;
  returning_60: number;
  series: Array<{ day: string; count: number }>;
  google: {
    cards: number;
    synced: number;
    failing: number;
    class_failing: number;
    last_error_at: string | null;
    last_error_code: string | null;
    card_version: number;
  };
  enroll: { started_7: number; verified_7: number; blocked: number };
  recent: Array<{
    id: string;
    short_code: string;
    name: string;
    stamps: number;
    rewards: number;
    points: number;
    last_visit_at: string;
    wallet_error: string | null;
    wallet_synced: boolean;
  }>;
  issues: Issue[];
}

/* ---------- numeri e durate ---------- */

const NUM = new Intl.NumberFormat("it-IT");
export const num = (n: number) => NUM.format(n);

/** "+8%" rispetto al periodo prima; null se prima non c'era niente da confrontare. */
export function deltaPercent(now: number, before: number): string | null {
  if (before <= 0) return null;
  const p = Math.round(((now - before) / before) * 100);
  return `${p > 0 ? "+" : ""}${p}%`;
}

/** Durata leggibile: "meno di un minuto", "35 min", "2 h", "5 giorni". */
export function duration(ms: number): string {
  const min = Math.max(0, Math.floor(ms / 60_000));
  if (min < 1) return "meno di un minuto";
  if (min < 60) return `${min} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? "1 giorno" : `${d} giorni`;
}

const since = (iso: string | null | undefined, now: Date) => (iso ? duration(now.getTime() - Date.parse(iso)) : null);
const days = (iso: string | null | undefined, now: Date) =>
  iso ? Math.max(1, Math.floor((now.getTime() - Date.parse(iso)) / 86_400_000)) : null;

const DAY = new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", day: "numeric", month: "short" });
export const shortDay = (iso: string) => DAY.format(new Date(iso));

const HM = new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit" });
const YMD = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" });
export const hourMinute = (iso: string) => HM.format(new Date(iso));

/** "10:31" oggi, "ieri 18:40", altrimenti "28 ott 09:12" (ora italiana). */
export function when(iso: string, now: Date): string {
  const d = new Date(iso);
  const day = YMD.format(d);
  if (day === YMD.format(now)) return HM.format(d);
  if (day === YMD.format(new Date(now.getTime() - 86_400_000))) return `ieri ${HM.format(d)}`;
  return `${DAY.format(d)} ${HM.format(d)}`;
}

/** Iniziali per i monogrammi: "Barberia Rossi" → "BR", "Enea" → "EN". */
export function initials(name: string): string {
  const words = name
    .replace(/[^\p{L}\p{N} ]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return (words[0]![0]! + words[1]![0]!).toUpperCase();
}

/** Saluto secondo l'ora italiana. */
export function greeting(now: Date): string {
  const h = Number(new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", hour: "numeric" }).format(now));
  return h >= 5 && h < 13 ? "Buongiorno" : h >= 13 && h < 18 ? "Buon pomeriggio" : "Buonasera";
}

/* ---------- cose da guardare ---------- */

export type Tone = "err" | "warn" | "neutral";

export interface IssueView {
  tone: Tone;
  /** Etichetta corta (badge della Panoramica). */
  label: string;
  /** Frase completa. */
  text: string;
  /** Riquadro in cima alla card del negozio. */
  band: string;
}

const str = (v: unknown) => (typeof v === "string" ? v : null);
const int = (v: unknown) => (typeof v === "number" ? v : Number(v) || 0);
const cards = (n: number) => (n === 1 ? "1 carta non sincronizzata" : `${n} carte non sincronizzate`);

export function describeIssue(issue: Issue, now: Date): IssueView {
  const d = issue.detail;
  switch (issue.kind) {
    case "sync": {
      const n = int(d.cards);
      const code = str(d.error_code);
      const exhausted = int(d.exhausted) > 0 ? " · ritentativi esauriti" : "";
      const what = n > 0 ? `${cards(n)} con Google Wallet` : "Template del negozio non aggiornato su Google Wallet";
      const ago = since(issue.since, now);
      return {
        tone: "err",
        label: "errore",
        text: `${what}${ago ? ` da ${ago}` : ""}${code ? ` · ${code}` : ""}${exhausted}`,
        band: n > 0 ? `${cards(n)} con Google` : "Template non aggiornato su Google",
      };
    }
    case "ticket": {
      const ticket = str(d.ticket) ?? "DIAG-…";
      const total = int(d.total);
      const app = [str(d.platform), str(d.app_version)].filter(Boolean).join(" ");
      return {
        tone: "warn",
        label: "ticket",
        text: `Pacchetto diagnostica ${ticket} ricevuto ${since(issue.since, now) ?? ""} fa${app ? ` · ${app}` : ""} · ${int(d.lines)} righe${total > 1 ? ` · ${total} pacchetti in 24 h` : ""}`,
        band: `Nuovo ticket ${ticket}`,
      };
    }
    case "invito": {
      const n = days(issue.since, now) ?? 1;
      const wait = n === 1 ? "da 1 giorno" : `da ${n} giorni`;
      return {
        tone: "warn",
        label: "invito",
        text: `Invito del titolare in attesa ${wait}: il negozio non è ancora operativo`,
        band: `Invito del titolare in attesa ${wait}`,
      };
    }
    case "inattivo": {
      const n = days(str(d.last_at), now);
      const text =
        n === null
          ? "Nessuna iscrizione e nessuna attività da quando è stato creato"
          : `Nessuna iscrizione e nessuna attività da ${n} giorni`;
      return { tone: "neutral", label: "inattivo", text, band: text };
    }
    case "diagnostica": {
      const expires = str(d.expires_at);
      const left = expires ? duration(Date.parse(expires) - now.getTime()) : null;
      const level = str(d.level) ?? "debug";
      const by = str(d.enabled_by);
      return {
        tone: "neutral",
        label: "diagnostica",
        text: `Modalità diagnostica «${level}» attiva · scade tra ${left ?? "poco"}${by ? ` · attivata da ${by}` : ""}`,
        band: `Diagnostica «${level}» attiva · scade tra ${left ?? "poco"}`,
      };
    }
    case "sospeso": {
      const reason = str(d.reason);
      const when = issue.since ? ` il ${shortDay(issue.since)}` : "";
      return {
        tone: "neutral",
        label: "sospeso",
        text: `Sospeso${when}${reason ? ` · «${reason}»` : ""}`,
        band: `Sospeso${when}${reason ? ` · «${reason}»` : ""}`,
      };
    }
  }
}

/** Problemi che contano nel numero rosso accanto a "Negozi": Google in errore o ticket appena arrivato. */
export const isProblem = (i: Issue) => i.kind === "sync" || i.kind === "ticket";

/* ---------- card dei negozi ---------- */

/** Etichette del programma: "Timbri · 10 → Taglio gratis", "Punti · 1 pt ogni €", "3 livelli", "Abbonamenti". */
export function programBadges(s: ShopCard): string[] {
  const out: string[] = [];
  if (s.loyalty_enabled) {
    if (s.loyalty_mode === "punti") {
      out.push(`Punti · ${s.points_per_euro} pt ogni €`);
      if (s.levels > 0) out.push(s.levels === 1 ? "1 livello" : `${s.levels} livelli`);
    } else {
      out.push(`Timbri · ${s.stamps_required} → ${s.reward_label}`);
    }
  }
  const tessere = s.prepaid_kinds.includes("consumo");
  const abbonamenti = s.prepaid_kinds.includes("abbonamento");
  if (!s.loyalty_enabled) {
    out.push(
      tessere && abbonamenti
        ? "Solo tessere e abbonamenti"
        : abbonamenti
          ? "Solo abbonamenti"
          : tessere
            ? "Solo tessere"
            : "Nessun programma attivo",
    );
  } else {
    if (tessere) out.push("Tessera prepagata");
    if (abbonamenti) out.push("Abbonamenti");
  }
  return out;
}

/** Nome della terza statistica della card, secondo il programma. */
export const activityLabel = (s: Pick<ShopCard, "loyalty_enabled" | "loyalty_mode">) =>
  !s.loyalty_enabled ? "Utilizzi" : s.loyalty_mode === "punti" ? "Scontrini" : "Timbri";

export type ShopState = "attivo" | "sospeso" | "da avviare";

export const shopState = (s: Pick<ShopCard, "status" | "issues">): ShopState =>
  s.status === "suspended" ? "sospeso" : s.issues.some((i) => i.kind === "invito") ? "da avviare" : "attivo";

export const STATUS_FILTERS = ["tutti", "problemi", "attivi", "inviti", "inattivi", "sospesi"] as const;
export type StatusFilter = (typeof STATUS_FILTERS)[number];
export const PROGRAM_FILTERS = ["tutti", "timbri", "punti", "tessere"] as const;
export type ProgramFilter = (typeof PROGRAM_FILTERS)[number];
export const SORTS = ["problemi", "attivi", "clienti", "recenti", "nome"] as const;
export type Sort = (typeof SORTS)[number];

export const STATUS_LABEL: Record<StatusFilter, string> = {
  tutti: "Tutti",
  problemi: "Con problemi",
  attivi: "Attivi",
  inviti: "Inviti in attesa",
  inattivi: "Inattivi da 14 gg",
  sospesi: "Sospesi",
};
export const PROGRAM_LABEL: Record<ProgramFilter, string> = {
  tutti: "Tutti",
  timbri: "Timbri",
  punti: "Punti",
  tessere: "Tessere / abbonamenti",
};
export const SORT_LABEL: Record<Sort, string> = {
  problemi: "Problemi prima",
  attivi: "Più attivi",
  clienti: "Più clienti",
  recenti: "Più recenti",
  nome: "Nome A–Z",
};

export function matchesStatus(s: ShopCard, f: StatusFilter): boolean {
  switch (f) {
    case "tutti":
      return true;
    case "problemi":
      return s.issues.some(isProblem);
    case "attivi":
      return s.status === "active";
    case "inviti":
      return s.issues.some((i) => i.kind === "invito");
    case "inattivi":
      return s.issues.some((i) => i.kind === "inattivo");
    case "sospesi":
      return s.status === "suspended";
  }
}

function matchesProgram(s: ShopCard, f: ProgramFilter): boolean {
  if (f === "tutti") return true;
  if (f === "tessere") return s.prepaid_kinds.length > 0;
  return s.loyalty_enabled && s.loyalty_mode === f;
}

function matchesQuery(s: ShopCard, q: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase().replace(/^\//, "");
  return [s.name, s.slug, s.owner_email, s.vat_number, s.owner].some((v) => v?.toLowerCase().includes(needle));
}

const priority = (s: ShopCard) => (s.issues.length ? Math.min(...s.issues.map((i) => ISSUE_RANK[i.kind])) : 99);
const ISSUE_RANK: Record<IssueKind, number> = {
  sync: 1,
  ticket: 2,
  invito: 3,
  inattivo: 4,
  diagnostica: 5,
  sospeso: 6,
};

export interface ShopQuery {
  q: string;
  stato: StatusFilter;
  programma: ProgramFilter;
  ordina: Sort;
}

const pick = <T extends string>(list: readonly T[], v: string | undefined, def: T): T =>
  list.includes(v as T) ? (v as T) : def;

export function parseShopQuery(p: Record<string, string | undefined>): ShopQuery {
  return {
    q: (p.q ?? "").trim(),
    stato: pick(STATUS_FILTERS, p.stato, "tutti"),
    programma: pick(PROGRAM_FILTERS, p.programma, "tutti"),
    ordina: pick(SORTS, p.ordina, "problemi"),
  };
}

/** Elenco filtrato e ordinato; i conteggi dei chip seguono ricerca e programma, non lo stato scelto. */
export function filterShops(list: ShopCard[], query: ShopQuery) {
  const base = list.filter((s) => matchesQuery(s, query.q) && matchesProgram(s, query.programma));
  const counts = Object.fromEntries(
    STATUS_FILTERS.map((f) => [f, base.filter((s) => matchesStatus(s, f)).length]),
  ) as Record<StatusFilter, number>;
  const byName = (a: ShopCard, b: ShopCard) => a.name.localeCompare(b.name, "it");
  const sorters: Record<Sort, (a: ShopCard, b: ShopCard) => number> = {
    problemi: (a, b) => priority(a) - priority(b) || b.activity_7 - a.activity_7 || byName(a, b),
    attivi: (a, b) => b.activity_7 - a.activity_7 || byName(a, b),
    clienti: (a, b) => b.customers - a.customers || byName(a, b),
    recenti: (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at),
    nome: byName,
  };
  const shops = base.filter((s) => matchesStatus(s, query.stato)).sort(sorters[query.ordina]);
  return { shops, counts };
}

/** Punti della linea a 30 giorni in un riquadro 140×34 (in alto = più attività). */
export function sparkPoints(values: number[], w = 140, h = 34): string {
  if (values.length === 0) return "";
  const max = Math.max(...values, 1);
  const step = values.length > 1 ? w / (values.length - 1) : 0;
  return values
    .map((v, i) => `${Math.round(i * step * 10) / 10},${Math.round((h - 3 - (v / max) * (h - 6)) * 10) / 10}`)
    .join(" ");
}

/** Massimo arrotondato per l'asse del grafico a barre (4 tacche: 0, ⅓, ⅔, max). */
export function axisMax(values: number[]): number {
  const max = Math.max(...values, 0);
  if (max <= 3) return 3;
  const step = 10 ** Math.floor(Math.log10(max / 3));
  const nice = [1, 2, 2.5, 5, 10].map((m) => m * step * 3).find((v) => v >= max);
  return nice ?? max;
}
