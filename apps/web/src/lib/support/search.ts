import "server-only";
import { errors, type ErrorCode } from "@loyalty/shared/errors";
import type { SupportQueryKind } from "@loyalty/shared/logging/events";
import {
  isRequestId,
  normalizeSupportCode,
  requestIdCandidatesFromSupportCode,
  supportCodeFromRequestId,
} from "@loyalty/shared/logging/request-id";
import { maskEmail } from "@loyalty/shared/logger";
import { checkItalianMobile } from "@loyalty/shared/phone";
import { explainError, type ErrorExplanation } from "@loyalty/shared/support/timeline";
import { log } from "../observability/logger";
import { phoneHash } from "../public/links";
import { supabaseAdmin } from "../supabase";
import type { SupportUser } from "./session";

/*
 * Ricerca della vista Assistenza: un solo campo, il tipo si riconosce dal testo.
 * Codice assistenza (ERR-7K3QX), request_id, ticket di diagnostica (DIAG-…), codice di errore del
 * catalogo (E_…), codice della carta, telefono (cercato per hash), email dello staff, negozio.
 * Ogni ricerca è tracciata (support.search) senza dati personali in chiaro.
 */

export type Classified =
  | { kind: "codice errore"; value: string }
  | { kind: "richiesta"; value: string }
  | { kind: "ticket diagnostica"; value: string }
  | { kind: "codice di errore del catalogo"; value: ErrorCode }
  | { kind: "email staff"; value: string }
  | { kind: "telefono"; value: string }
  | { kind: "carta"; value: string }
  | { kind: "negozio"; value: string };

const SHORT_CODE_RE = /^[2-9A-HJ-NP-Z]{8}$/;

export function classifySupportQuery(input: string): Classified {
  const q = input.trim();
  const upper = q.toUpperCase().replace(/\s+/g, "");
  if (/^ERR[-]?[0-9A-Z]{5}$/.test(upper)) {
    const code = normalizeSupportCode(upper);
    if (code) return { kind: "codice errore", value: code };
  }
  if (isRequestId(upper)) return { kind: "richiesta", value: upper };
  if (/^DIAG-[0-9A-Z]{8}$/.test(upper)) return { kind: "ticket diagnostica", value: upper };
  if (/^E_[A-Z0-9_]+$/.test(upper) && Object.hasOwn(errors, upper))
    return { kind: "codice di errore del catalogo", value: upper as ErrorCode };
  if (q.includes("@")) return { kind: "email staff", value: q.toLowerCase() };
  if (/^[+\d][\d\s().-]{7,}$/.test(q)) {
    const phone = checkItalianMobile(q);
    if (phone.ok) return { kind: "telefono", value: phone.e164 };
  }
  if (SHORT_CODE_RE.test(upper)) return { kind: "carta", value: upper };
  return { kind: "negozio", value: q };
}

export interface SearchHit {
  href: string;
  title: string;
  detail: string;
}

export interface SearchResult {
  kind: SupportQueryKind;
  hits: SearchHit[];
  /** Codice di errore cercato: spiegazione dal catalogo. */
  explanation?: ErrorExplanation;
  /** Un solo risultato non ambiguo: si apre direttamente. */
  redirect?: string;
}

const dt = new Intl.DateTimeFormat("it-IT", {
  timeZone: "Europe/Rome",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});
const when = (iso: string) => dt.format(new Date(iso)).replace(",", "");

async function requestsLike(prefixes: string[]): Promise<SearchHit[]> {
  const db = supabaseAdmin();
  const or = prefixes.map((p) => `request_id.like.${p}%`).join(",");
  const { data, error } = await db
    .from("log_events")
    .select("request_id, ts, msg, event, level")
    .or(or)
    .order("ts", { ascending: true })
    .limit(200);
  if (error) throw error;
  const byId = new Map<string, Array<{ ts: string; msg: string; event: string }>>();
  for (const r of data ?? []) {
    const id = r.request_id as string;
    if (!byId.has(id)) byId.set(id, []);
    byId.get(id)!.push({ ts: r.ts as string, msg: r.msg as string, event: r.event as string });
  }
  // titolo: la prima riga che non sia l'inizio della richiesta (di solito l'evento di dominio)
  const first = new Map(
    [...byId.entries()].map(([id, rows]) => [id, rows.find((x) => x.event !== "http.request.start") ?? rows[0]!]),
  );
  return [...first.entries()].map(([id, v]) => ({
    href: `/interno/richieste/${id}`,
    title: v.msg,
    detail: `${supportCodeFromRequestId(id)} · ${when(v.ts)}`,
  }));
}

async function appRequests(supportCode: string): Promise<SearchHit[]> {
  const { data, error } = await supabaseAdmin()
    .from("diagnostic_bundles")
    .select("ticket_code, events")
    .contains("events", JSON.stringify([{ support_code: supportCode }]))
    .limit(5);
  if (error) throw error;
  const hits: SearchHit[] = [];
  for (const b of data ?? []) {
    for (const e of (b.events as Array<Record<string, unknown>>) ?? []) {
      if (e.support_code === supportCode && typeof e.request_id === "string") {
        hits.push({
          href: `/interno/richieste/${e.request_id}`,
          title: `App: ${String(e.msg ?? e.event)}`,
          detail: `${supportCode} · dal pacchetto ${b.ticket_code as string} (mai arrivata al server)`,
        });
      }
    }
  }
  return hits;
}

async function cardsBy(column: "short_code" | "phone_hash", value: string): Promise<SearchHit[]> {
  const { data, error } = await supabaseAdmin()
    .from("customers")
    .select("id, short_code, stamps, rewards_available, points, points_level, deleted_at, shops(name, loyalty_mode)")
    .eq(column, value)
    .limit(20);
  if (error) throw error;
  return (data ?? []).map((c) => ({
    href: `/interno/clienti/${c.id as string}`,
    title: `Carta ${c.short_code as string} · ${(c.shops as unknown as { name: string } | null)?.name ?? "negozio"}`,
    detail: c.deleted_at
      ? "cliente cancellato"
      : (c.shops as unknown as { loyalty_mode?: string } | null)?.loyalty_mode === "punti"
        ? `${c.points as number} punti, livello ${(c.points_level as string | null) ?? "—"}`
        : `${c.stamps as number} timbri, ${c.rewards_available as number} premi`,
  }));
}

/** Tessere prepagate con quel codice breve (Fase 9.5). */
async function prepaidBy(shortCode: string): Promise<SearchHit[]> {
  const { data, error } = await supabaseAdmin()
    .from("prepaid_cards")
    .select("id, short_code, balance, status, deleted_at, prepaid_products(name), shops(name)")
    .eq("short_code", shortCode)
    .limit(20);
  if (error) throw error;
  return (data ?? []).map((t) => ({
    href: `/interno/tessere/${t.id as string}`,
    title: `Tessera ${t.short_code as string} · ${(t.prepaid_products as unknown as { name: string } | null)?.name ?? "tessera"} · ${(t.shops as unknown as { name: string } | null)?.name ?? "negozio"}`,
    detail: t.deleted_at ? "cancellata" : t.status === "pending" ? "da attivare" : `saldo ${t.balance as number}`,
  }));
}

async function run(c: Classified): Promise<SearchResult> {
  const db = supabaseAdmin();
  switch (c.kind) {
    case "codice errore": {
      const prefixes = requestIdCandidatesFromSupportCode(c.value).map((x) => x.prefix);
      const hits = [...(prefixes.length ? await requestsLike(prefixes) : []), ...(await appRequests(c.value))];
      const unique = [...new Map(hits.map((h) => [h.href, h])).values()];
      return { kind: c.kind, hits: unique };
    }
    case "richiesta":
      return {
        kind: c.kind,
        hits: [
          {
            href: `/interno/richieste/${c.value}`,
            title: "Apri la richiesta",
            detail: supportCodeFromRequestId(c.value),
          },
        ],
      };
    case "ticket diagnostica": {
      const { data, error } = await db
        .from("diagnostic_bundles")
        .select("ticket_code")
        .eq("ticket_code", c.value)
        .maybeSingle();
      if (error) throw error;
      return {
        kind: c.kind,
        hits: data ? [{ href: `/interno/diagnostica/${c.value}`, title: `Pacchetto ${c.value}`, detail: "" }] : [],
      };
    }
    case "codice di errore del catalogo": {
      const { data, error } = await db
        .from("log_events")
        .select("request_id, ts, msg")
        .eq("error_code", c.value)
        .order("ts", { ascending: false })
        .limit(30);
      if (error) throw error;
      const hits = [
        ...new Map((data ?? []).filter((r) => r.request_id).map((r) => [r.request_id as string, r])).values(),
      ].map((r) => ({
        href: `/interno/richieste/${r.request_id as string}`,
        title: r.msg as string,
        detail: `${supportCodeFromRequestId(r.request_id as string)} · ${when(r.ts as string)}`,
      }));
      return { kind: c.kind, hits, explanation: explainError(c.value)! };
    }
    case "email staff": {
      const { data: id, error } = await db.rpc("find_user_id_by_email", { p_email: c.value });
      if (error) throw error;
      if (!id) return { kind: c.kind, hits: [] };
      const { data: rows, error: e2 } = await db
        .from("staff")
        .select("display_name, role, shops(name)")
        .eq("user_id", id as string);
      if (e2) throw e2;
      const shops = (rows ?? []).map(
        (r) =>
          `${(r.shops as unknown as { name: string } | null)?.name ?? "?"} (${r.role === "owner" ? "titolare" : "operatore"})`,
      );
      return {
        kind: c.kind,
        hits: [
          {
            href: `/interno/utenti/${id as string}`,
            title: `${(rows?.[0]?.display_name as string | undefined) ?? "Utente"} · ${maskEmail(c.value)}`,
            detail: shops.length ? shops.join(", ") : "non fa parte dello staff di alcun negozio",
          },
        ],
      };
    }
    case "telefono":
      return { kind: c.kind, hits: await cardsBy("phone_hash", phoneHash(c.value)) };
    case "carta":
      return { kind: c.kind, hits: [...(await cardsBy("short_code", c.value)), ...(await prepaidBy(c.value))] };
    case "negozio": {
      const term = c.value.replace(/[%,()]/g, "");
      const { data, error } = await db
        .from("shops")
        .select("id, name, slug, status")
        .or(`slug.ilike.%${term}%,name.ilike.%${term}%`)
        .order("name")
        .limit(30);
      if (error) throw error;
      return {
        kind: c.kind,
        hits: (data ?? []).map((s) => ({
          href: `/interno/negozi/${s.id as string}`,
          title: s.name as string,
          detail: `/${s.slug as string}${s.status === "suspended" ? " · sospeso" : ""}`,
        })),
      };
    }
  }
}

/** Testo della ricerca senza dati personali: il telefono diventa un estratto del suo hash, l'email è mascherata. */
function safeQuery(c: Classified): string {
  if (c.kind === "telefono") return `hash ${phoneHash(c.value).slice(0, 6)}…`;
  if (c.kind === "email staff") return maskEmail(c.value);
  return c.value.slice(0, 60);
}

const DIRECT: ReadonlySet<SupportQueryKind> = new Set([
  "codice errore",
  "richiesta",
  "ticket diagnostica",
  "carta",
  "telefono",
  "email staff",
]);

export async function search(input: string, user: SupportUser): Promise<SearchResult> {
  const c = classifySupportQuery(input);
  const result = await run(c);
  log.event("support.search", {
    support_name: user.name,
    query_kind: c.kind,
    query: safeQuery(c),
    results: result.hits.length,
  });
  if (result.hits.length === 1 && DIRECT.has(c.kind)) result.redirect = result.hits[0]!.href;
  return result;
}
