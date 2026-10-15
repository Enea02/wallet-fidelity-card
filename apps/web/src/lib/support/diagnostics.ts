import "server-only";
import { AppError } from "@loyalty/shared/errors";
import type { DiagnosticScopeType } from "@loyalty/shared/logging/events";
import { maskEmail } from "@loyalty/shared/logger";
import { groupTimeline, type TimelineBlock } from "@loyalty/shared/support/timeline";
import { callDomain } from "../merchant/domain-call";
import { setContext } from "../observability/context";
import { diagnosticFields, resetDiagnosticCache } from "../observability/diagnostic";
import type { DiagnosticMode } from "../observability/diagnostic-state";
import { log } from "../observability/logger";
import { supabaseAdmin } from "../supabase";
import type { SupportUser } from "./session";
import { supportMeta } from "./shops";
import { appItems } from "./timeline";

/*
 * Modalità diagnostica dal pannello (log debug/trace con payload per un negozio, un utente staff
 * o un cliente, con scadenza) e pacchetti "Invia diagnostica" ricevuti dalle app.
 * Ogni attivazione e disattivazione resta in audit_log (support) e nel log (support.diagnostic.*).
 */

const SCOPE_ENTITY: Record<DiagnosticScopeType, string> = { shop: "shop", staff_user: "staff", customer: "customer" };

async function resolveScope(type: DiagnosticScopeType, id: string) {
  const db = supabaseAdmin();
  if (type === "shop") {
    const { data, error } = await db.from("shops").select("id, slug").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!data) throw new AppError("E_SHOP_NOT_FOUND", `negozio ${id} non trovato`);
    return { label: data.slug as string, shopId: data.id as string };
  }
  if (type === "customer") {
    const { data, error } = await db.from("customers").select("short_code, shop_id").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!data) throw new AppError("E_CARD_NOT_FOUND", `cliente ${id} non trovato`, { customer_id: id });
    return { label: data.short_code as string, shopId: data.shop_id as string };
  }
  const { data, error } = await db.auth.admin.getUserById(id);
  if (error || !data.user) throw new AppError("E_STAFF_NOT_FOUND", `utente ${id} non trovato`, { user_id: id });
  return { label: maskEmail(data.user.email ?? id), shopId: null };
}

export interface EnableInput {
  scopeType: DiagnosticScopeType;
  scopeId: string;
  level: "debug" | "trace";
  hours: number;
  reason: string;
}

export async function enableDiagnostic(input: EnableInput, user: SupportUser) {
  if (!Number.isInteger(input.hours) || input.hours < 1 || input.hours > 168) {
    throw new AppError(
      "E_VALIDATION",
      `durata ${input.hours} ore fuori da 1–168`,
      { fields: ["hours"] },
      {
        userMessage: "Durata non valida: da 1 ora a 7 giorni.",
      },
    );
  }
  if (input.reason.trim().length < 5) {
    throw new AppError(
      "E_VALIDATION",
      "motivo della diagnostica troppo corto",
      { fields: ["reason"] },
      {
        userMessage: "Scrivi il motivo (almeno 5 caratteri): resta nello storico.",
      },
    );
  }
  const scope = await resolveScope(input.scopeType, input.scopeId);
  if (scope.shopId) setContext({ shop_id: scope.shopId });
  const { data, error } = await supabaseAdmin()
    .rpc("enable_diagnostic_mode", {
      p_scope_type: input.scopeType,
      p_scope_id: input.scopeId,
      p_scope_label: scope.label,
      p_reason: input.reason.trim(),
      p_enabled_by: user.name,
      p_level: input.level,
      p_hours: input.hours,
    })
    .single<DiagnosticMode>();
  if (error) throw error;
  await callDomain("support_record", {
    p_meta: supportMeta(user),
    p_shop_id: scope.shopId,
    p_action: "diagnostic_enable",
    p_entity: SCOPE_ENTITY[input.scopeType],
    p_entity_id: input.scopeId,
    p_after: { level: data.level, expires_at: data.expires_at, scope_label: scope.label },
    p_reason: input.reason,
  });
  resetDiagnosticCache();
  log.event("support.diagnostic.enabled", diagnosticFields(data));
  return data;
}

export async function disableDiagnostic(id: string, user: SupportUser) {
  const { data, error } = await supabaseAdmin()
    .rpc("disable_diagnostic_mode", { p_id: id, p_disabled_by: user.name })
    .maybeSingle<DiagnosticMode>();
  if (error) throw error;
  if (!data) {
    throw new AppError(
      "E_VALIDATION",
      `modalità diagnostica ${id} non trovata o già chiusa`,
      {},
      {
        userMessage: "Questa modalità diagnostica è già chiusa.",
      },
    );
  }
  const scope = await resolveScope(data.scope_type, data.scope_id).catch(() => ({ shopId: null }));
  await callDomain("support_record", {
    p_meta: supportMeta(user),
    p_shop_id: scope.shopId,
    p_action: "diagnostic_disable",
    p_entity: SCOPE_ENTITY[data.scope_type],
    p_entity_id: data.scope_id,
    p_after: { level: data.level, scope_label: data.scope_label },
    p_reason: data.reason,
  });
  resetDiagnosticCache();
  log.event("support.diagnostic.disabled", { ...diagnosticFields(data), disabled_by: user.name });
  return data;
}

export interface ModeRow extends DiagnosticMode {
  disabled_at: string | null;
  disabled_by: string | null;
}

export async function listModes(): Promise<{ open: ModeRow[]; recent: ModeRow[] }> {
  const db = supabaseAdmin();
  const now = new Date().toISOString();
  const cols =
    "id, scope_type, scope_id, scope_label, level, reason, enabled_by, enabled_at, expires_at, disabled_at, disabled_by";
  const [open, recent] = await Promise.all([
    db.from("diagnostic_modes").select(cols).is("disabled_at", null).gt("expires_at", now).order("expires_at"),
    db.from("diagnostic_modes").select(cols).order("enabled_at", { ascending: false }).limit(20),
  ]);
  if (open.error) throw open.error;
  if (recent.error) throw recent.error;
  const openIds = new Set((open.data ?? []).map((m) => m.id));
  return {
    open: (open.data ?? []) as ModeRow[],
    recent: ((recent.data ?? []) as ModeRow[]).filter((m) => !openIds.has(m.id)),
  };
}

export async function openModesFor(scopeType: DiagnosticScopeType, scopeId: string): Promise<ModeRow[]> {
  const { data, error } = await supabaseAdmin()
    .from("diagnostic_modes")
    .select(
      "id, scope_type, scope_id, scope_label, level, reason, enabled_by, enabled_at, expires_at, disabled_at, disabled_by",
    )
    .eq("scope_type", scopeType)
    .eq("scope_id", scopeId)
    .is("disabled_at", null)
    .gt("expires_at", new Date().toISOString());
  if (error) throw error;
  return (data ?? []) as ModeRow[];
}

export interface BundleRow {
  ticket_code: string;
  created_at: string;
  platform: string | null;
  app_version: string | null;
  size_bytes: number;
  shop_id: string | null;
  user_id: string | null;
  note: string | null;
  shopName: string | null;
  events: number;
}

export async function listBundles(limit = 50): Promise<BundleRow[]> {
  const { data, error } = await supabaseAdmin()
    .from("diagnostic_bundles")
    .select("ticket_code, created_at, platform, app_version, size_bytes, shop_id, user_id, note, events, shops(name)")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((b) => ({
    ticket_code: b.ticket_code as string,
    created_at: b.created_at as string,
    platform: b.platform as string | null,
    app_version: b.app_version as string | null,
    size_bytes: b.size_bytes as number,
    shop_id: b.shop_id as string | null,
    user_id: b.user_id as string | null,
    note: b.note as string | null,
    shopName: (b.shops as unknown as { name: string } | null)?.name ?? null,
    events: Array.isArray(b.events) ? b.events.length : 0,
  }));
}

export async function bundleDetail(
  ticket: string,
): Promise<
  (Omit<BundleRow, "events"> & { device: Record<string, unknown>; blocks: TimelineBlock[]; events: number }) | null
> {
  const { data: b, error } = await supabaseAdmin()
    .from("diagnostic_bundles")
    .select(
      "ticket_code, created_at, platform, app_version, size_bytes, shop_id, user_id, note, device, events, shops(name)",
    )
    .eq("ticket_code", ticket)
    .maybeSingle();
  if (error) throw error;
  if (!b) return null;
  if (b.shop_id) setContext({ shop_id: b.shop_id as string });
  const items = appItems({ ticket_code: b.ticket_code as string, events: b.events });
  return {
    ticket_code: b.ticket_code as string,
    created_at: b.created_at as string,
    platform: b.platform as string | null,
    app_version: b.app_version as string | null,
    size_bytes: b.size_bytes as number,
    shop_id: b.shop_id as string | null,
    user_id: b.user_id as string | null,
    note: b.note as string | null,
    shopName: (b.shops as unknown as { name: string } | null)?.name ?? null,
    device: (b.device ?? {}) as Record<string, unknown>,
    blocks: groupTimeline(items),
    events: items.length,
  };
}
