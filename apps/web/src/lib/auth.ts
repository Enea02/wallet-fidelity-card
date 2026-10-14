import "server-only";
import { AppError } from "@loyalty/shared/errors";
import { setContext } from "./observability/context";
import { log } from "./observability/logger";
import { supabaseAdmin } from "./supabase";
import type { StaffRole } from "./types";

export interface AuthUser {
  id: string;
  email: string | null;
}

export interface Membership {
  userId: string;
  shopId: string;
  role: StaffRole;
  displayName: string;
}

/**
 * Verifica il bearer token Supabase e restituisce l'utente; user_id finisce nel contesto di log.
 * Token assente → E_AUTH_REQUIRED; token scaduto o non valido → E_AUTH_INVALID (auth.token.invalid).
 */
export async function authenticateUser(req: Request, route: string): Promise<AuthUser> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) throw new AppError("E_AUTH_REQUIRED", "richiesta senza header Authorization: Bearer");

  const { data, error } = await supabaseAdmin().auth.getUser(token);
  if (error || !data.user) {
    const raw = (error?.message ?? "").toLowerCase();
    const reason = raw.includes("expired") ? "scaduto" : !error ? "utente inesistente" : "non valido";
    log.event("auth.token.invalid", { route, reason });
    const err = new AppError("E_AUTH_INVALID", `token ${reason}: ${error?.message ?? "utente assente"}`);
    err.logged = true;
    throw err;
  }
  setContext({ user_id: data.user.id });
  return { id: data.user.id, email: data.user.email ?? null };
}

/** Appartenenza dell'utente allo staff del negozio, null se non ne fa parte. */
export async function loadMembership(userId: string, shopId: string): Promise<Membership | null> {
  const { data, error } = await supabaseAdmin()
    .from("staff")
    .select("role, display_name")
    .eq("user_id", userId)
    .eq("shop_id", shopId)
    .maybeSingle<{ role: StaffRole; display_name: string }>();
  if (error) throw error;
  return data ? { userId, shopId, role: data.role, displayName: data.display_name } : null;
}
