import "server-only";
import { AppError } from "@loyalty/shared/errors";
import { setContext } from "./observability/context";
import { log } from "./observability/logger";
import { supabaseAdmin } from "./supabase";
import type { StaffRole } from "./types";
import type { RequestSession } from "./web-session";

export interface AuthUser {
  id: string;
  email: string | null;
  /** Come si è autenticato: token Bearer (app iOS/Android) o cookie della sessione web (/accesso). */
  via: "token" | "cookie";
}

export interface Membership {
  userId: string;
  shopId: string;
  role: StaffRole;
  displayName: string;
}

/** Token dell'header Authorization: Bearer, "" se assente. */
export function bearerToken(req: Request): string {
  const header = req.headers.get("authorization") ?? "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

/**
 * Verifica il bearer token Supabase (app native) oppure, se manca, la sessione web nei cookie
 * (`session`, web app esercente su /app) e restituisce l'utente; user_id finisce nel contesto di log.
 * Né token né cookie → E_AUTH_REQUIRED; token o sessione scaduti o non validi → E_AUTH_INVALID (auth.token.invalid).
 */
export async function authenticateUser(
  req: Request,
  route: string,
  session?: RequestSession | null,
): Promise<AuthUser> {
  const token = bearerToken(req);
  if (!token && session) return authenticateCookie(session, route);
  if (!token)
    throw new AppError("E_AUTH_REQUIRED", "richiesta senza header Authorization: Bearer né cookie di sessione");

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
  return { id: data.user.id, email: data.user.email ?? null, via: "token" };
}

/** Sessione web: Supabase la rinnova da sé se il token è scaduto (i cookie nuovi vanno in session.pending). */
async function authenticateCookie(session: RequestSession, route: string): Promise<AuthUser> {
  const { data, error } = await session.sb.auth.getUser();
  if (error || !data.user) {
    log.event("auth.token.invalid", { route, reason: "sessione web scaduta o chiusa" });
    const err = new AppError("E_AUTH_INVALID", `sessione web non valida: ${error?.message ?? "utente assente"}`);
    err.logged = true;
    throw err;
  }
  setContext({ user_id: data.user.id });
  return { id: data.user.id, email: data.user.email ?? null, via: "cookie" };
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
