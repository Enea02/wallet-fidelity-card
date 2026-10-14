import "server-only";
import type { CustomerDetailResponse, CustomerItem, CustomersQuery, CustomersResponse } from "@loyalty/shared/api";
import { ShortCode } from "@loyalty/shared/api";
import { AppError } from "@loyalty/shared/errors";
import { maskPhone } from "@loyalty/shared/logger";
import type { ActorFields } from "@loyalty/shared/logging/events";
import type { z } from "zod";
import { setContext } from "../observability/context";
import { log } from "../observability/logger";
import { supabaseAdmin } from "../supabase";
import type { Shop } from "../types";

const COLS = "id, short_code, name, phone, stamps, rewards_available, consent_marketing, created_at";

interface Row {
  id: string;
  short_code: string;
  name: string;
  phone: string | null;
  stamps: number;
  rewards_available: number;
  consent_marketing: boolean;
  created_at: string;
}

const toItem = (r: Row): z.infer<typeof CustomerItem> => ({
  id: r.id,
  shortCode: r.short_code,
  name: r.name,
  phoneMasked: r.phone ? maskPhone(r.phone) : null,
  stamps: r.stamps,
  rewardsAvailable: r.rewards_available,
  consentMarketing: r.consent_marketing,
  createdAt: new Date(r.created_at).toISOString(),
});

type QueryKind = "tutti" | "telefono" | "codice breve" | "nome";

/** Cosa ha scritto il titolare: telefono (normalizzato E.164, default +39), codice breve o nome. */
export function classifyQuery(q: string | undefined): { kind: QueryKind; value: string } {
  const text = (q ?? "").trim();
  if (!text) return { kind: "tutti", value: "" };
  if (ShortCode.safeParse(text.toUpperCase()).success && /[A-Z]/i.test(text)) {
    return { kind: "codice breve", value: text.toUpperCase() };
  }
  if (/^\+?[\d\s.-]{6,}$/.test(text)) {
    let digits = text.replace(/[\s.-]/g, "");
    if (digits.startsWith("00")) digits = `+${digits.slice(2)}`;
    if (!digits.startsWith("+")) digits = `+39${digits}`;
    return { kind: "telefono", value: digits };
  }
  return { kind: "nome", value: text };
}

const encodeCursor = (r: Row) => Buffer.from(JSON.stringify({ c: r.created_at, i: r.id })).toString("base64url");

function decodeCursor(cursor: string): { c: string; i: string } {
  try {
    const v = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as { c?: unknown; i?: unknown };
    if (typeof v.c === "string" && typeof v.i === "string" && !Number.isNaN(Date.parse(v.c))) return { c: v.c, i: v.i };
  } catch {
    // gestito sotto
  }
  throw new AppError("E_VALIDATION", "cursore di paginazione non valido", { fields: ["query.cursor"] });
}

/** Lista clienti attivi, dal più recente, con ricerca e paginazione a cursore. */
export async function listCustomers(
  shop: Shop,
  query: z.output<typeof CustomersQuery>,
  actor: ActorFields,
): Promise<z.input<typeof CustomersResponse>> {
  const { kind, value } = classifyQuery(query.q);
  let q = supabaseAdmin()
    .from("customers")
    .select(COLS)
    .eq("shop_id", shop.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(query.limit + 1);

  if (kind === "telefono") q = q.eq("phone", value);
  if (kind === "codice breve") q = q.eq("short_code", value);
  if (kind === "nome") q = q.ilike("name", `%${value.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
  if (query.cursor) {
    const { c, i } = decodeCursor(query.cursor);
    q = q.or(`created_at.lt."${c}",and(created_at.eq."${c}",id.lt.${i})`);
  }

  const { data, error } = await q;
  if (error) throw error;
  const rows = (data ?? []) as Row[];
  const page = rows.slice(0, query.limit);
  const last = page.at(-1);

  log.event("customer.search", { ...actor, shop_name: shop.name, query_kind: kind, results: page.length });
  return { items: page.map(toItem), nextCursor: rows.length > query.limit && last ? encodeCursor(last) : null };
}

interface AuditRow {
  ts: string;
  action: string;
  actor_type: string;
  actor_id: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  reason: string | null;
}

/** Dettaglio della carta con lo storico (dall'audit), con il nome di chi ha agito. */
export async function customerDetail(shop: Shop, customerId: string): Promise<z.input<typeof CustomerDetailResponse>> {
  const db = supabaseAdmin();
  const { data: row, error } = await db
    .from("customers")
    .select(`${COLS}, deleted_at`)
    .eq("shop_id", shop.id)
    .eq("id", customerId)
    .maybeSingle<Row & { deleted_at: string | null }>();
  if (error) throw error;
  if (!row) throw new AppError("E_CARD_NOT_FOUND", `nessuna carta ${customerId} nel negozio ${shop.id}`);
  setContext({ customer_ref: row.short_code });
  if (row.deleted_at)
    throw new AppError("E_CARD_DELETED", `la carta ${row.short_code} è stata cancellata il ${row.deleted_at}`);

  const [{ data: audit, error: e1 }, { data: staff, error: e2 }] = await Promise.all([
    db
      .from("audit_log")
      .select("ts, action, actor_type, actor_id, before, after, reason")
      .eq("entity", "customer")
      .eq("entity_id", customerId)
      .order("id", { ascending: false })
      .limit(100),
    db.from("staff").select("user_id, display_name").eq("shop_id", shop.id),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;
  const names = new Map((staff ?? []).map((s) => [s.user_id as string, s.display_name as string]));
  const actorName = (a: AuditRow) =>
    a.actor_type === "customer"
      ? "cliente"
      : a.actor_type === "support"
        ? "assistenza"
        : a.actor_type === "system"
          ? "sistema"
          : (names.get(a.actor_id ?? "") ?? "ex membro dello staff");

  return {
    customer: { ...toItem(row), stampsRequired: shop.stamps_required, rewardLabel: shop.reward_label },
    history: ((audit ?? []) as AuditRow[]).map((a) => ({
      at: new Date(a.ts).toISOString(),
      action: a.action,
      actorName: actorName(a),
      before: a.before,
      after: a.after,
      reason: a.reason,
    })),
  };
}
