import "server-only";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { AppError } from "@loyalty/shared/errors";
import type { SupportDeniedReason } from "@loyalty/shared/logging/events";
import { maskEmail } from "@loyalty/shared/logger";
import { cookies } from "next/headers";
import { requireEnv } from "../env";
import { setContext } from "../observability/context";
import { log } from "../observability/logger";
import { supabaseAdmin } from "../supabase";

/**
 * Sessione del pannello interno: Supabase Auth con cookie httpOnly (@supabase/ssr), solo per il
 * nostro team (support_members) e solo con il secondo fattore verificato (aal2, codice TOTP).
 * La sessione vale 12 ore dall'ultimo accesso con codice, poi si rientra.
 */

export const SESSION_HOURS = 12;

export interface SupportUser {
  userId: string;
  email: string;
  name: string;
}

/** Client Supabase con la sessione nei cookie. Nei Server Component i cookie non si scrivono: li aggiorna proxy.ts. */
export async function supportAuthClient(): Promise<SupabaseClient> {
  const store = await cookies();
  return createServerClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"), {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const c of list) store.set(c.name, c.value, { ...c.options, httpOnly: true, sameSite: "lax" });
        } catch {
          // Server Component: i cookie li rinnova proxy.ts alla richiesta successiva
        }
      },
    },
  });
}

export async function memberOf(userId: string): Promise<{ name: string } | null> {
  const { data, error } = await supabaseAdmin()
    .from("support_members")
    .select("display_name, active")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data && data.active ? { name: data.display_name as string } : null;
}

export type SessionCheck =
  { ok: true; user: SupportUser } | { ok: false; reason: SupportDeniedReason; email: string | null; user: User | null };

/** Stato della sessione senza effetti: chi è, se è nel team, se ha il secondo fattore valido e recente. */
export async function checkSupportSession(): Promise<SessionCheck> {
  const sb = await supportAuthClient();
  const { data } = await sb.auth.getUser();
  const user = data.user;
  if (!user) return { ok: false, reason: "sessione assente", email: null, user: null };
  const email = user.email ?? "";
  const member = await memberOf(user.id);
  if (!member) return { ok: false, reason: "non nel team", email, user };

  const { data: aal } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
  const mfaAt = (aal?.currentAuthenticationMethods ?? [])
    .flatMap((m) => (typeof m === "object" && m.method === "totp" ? [m.timestamp * 1000] : []))
    .reduce((max, t) => Math.max(max, t), 0);
  if (aal?.currentLevel !== "aal2" || !mfaAt) return { ok: false, reason: "secondo fattore mancante", email, user };
  if (Date.now() - mfaAt > SESSION_HOURS * 3600 * 1000) return { ok: false, reason: "sessione assente", email, user };

  return { ok: true, user: { userId: user.id, email, name: member.name } };
}

/** Per pagine e azioni: membro del team con 2FA, altrimenti support.access.denied ed errore del catalogo. */
export async function requireSupport(route: string): Promise<SupportUser> {
  const s = await checkSupportSession();
  if (s.ok) {
    setContext({ user_id: s.user.userId, role: "support" });
    return s.user;
  }
  log.event("support.access.denied", { route, reason: s.reason, email: s.email ? maskEmail(s.email) : null });
  const code =
    s.reason === "sessione assente"
      ? "E_SUPPORT_UNAUTHORIZED"
      : s.reason === "non nel team"
        ? "E_SUPPORT_FORBIDDEN"
        : "E_SUPPORT_MFA_REQUIRED";
  const err = new AppError(code, `pannello interno ${route}: ${s.reason}`, { reason: s.reason });
  err.logged = true;
  throw err;
}
