import "server-only";
import { AppError } from "@loyalty/shared/errors";
import type { AuthDestination, AuthLoginNext } from "@loyalty/shared/logging/events";
import { maskEmail } from "@loyalty/shared/logger";
import { destinationFor, hasAnyAccess, nextAfterPassword, safeReturnUrl, type Access } from "./access-rules";
import { MERCHANT_APP_PATH, merchantAppUrl, siteOrigin } from "./merchant-app";
import { setContext } from "./observability/context";
import { log } from "./observability/logger";
import { supabaseAdmin } from "./supabase";
import { checkSupportSession, memberOf } from "./support/session";
import { cookieSessionClient } from "./web-session";

/*
 * Login unico su /accesso per il pannello interno e la web app esercente: una sola sessione nei
 * cookie httpOnly. Le regole (chi va dove) sono in access-rules.ts; qui Supabase, log ed errori.
 */

/** A cosa ha diritto l'utente: team interno e numero di negozi in cui è nello staff. */
export async function accessOf(userId: string): Promise<Access> {
  const [member, staff] = await Promise.all([
    memberOf(userId),
    supabaseAdmin().from("staff").select("shop_id", { count: "exact", head: true }).eq("user_id", userId),
  ]);
  if (staff.error) throw staff.error;
  return { team: member !== null, shops: staff.count ?? 0 };
}

function loginFailed(email: string, reason: "email o password non corrette" | "troppi tentativi"): never {
  log.event("auth.login.failed", { email: maskEmail(email), reason });
  const err = new AppError("E_LOGIN_FAILED", `login rifiutato per ${maskEmail(email)}: ${reason}`);
  err.logged = true;
  throw err;
}

export interface PasswordResult {
  userId: string;
  access: Access;
  next: AuthLoginNext;
}

/** Passo 1: email e password. Apre la sessione nei cookie e dice il passo successivo. */
export async function loginPassword(emailIn: string, password: string): Promise<PasswordResult> {
  const email = emailIn.trim().toLowerCase();
  const sb = await cookieSessionClient();
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error || !data.user)
    loginFailed(email, error?.status === 429 ? "troppi tentativi" : "email o password non corrette");
  setContext({ user_id: data.user.id });

  const access = await accessOf(data.user.id);
  if (!hasAnyAccess(access)) {
    // nessuna sessione per chi non ha niente da aprire
    await sb.auth.signOut({ scope: "local" });
    log.event("auth.login.failed", {
      email: maskEmail(email),
      reason: "nessun accesso: né nel team né nello staff di un negozio",
    });
    const err = new AppError("E_LOGIN_NO_ACCESS", `${data.user.id} non è né nel team né nello staff di un negozio`);
    err.logged = true;
    throw err;
  }

  let verifiedFactor = false;
  if (access.team) {
    const { data: factors } = await sb.auth.mfa.listFactors();
    verifiedFactor = factors?.totp.some((f) => f.status === "verified") ?? false;
  }
  const next = nextAfterPassword(access, verifiedFactor);
  log.event("auth.login.ok", { email: maskEmail(email), team: access.team, shops_count: access.shops, next });
  return { userId: data.user.id, access, next };
}

/** Stato della sessione web corrente, per decidere cosa mostrare su /accesso. */
export type CurrentAccess =
  { state: "nessuna" } | { state: "codice"; access: Access } | { state: "pronta"; userId: string; access: Access };

export async function currentAccess(): Promise<CurrentAccess> {
  const sb = await cookieSessionClient();
  const { data } = await sb.auth.getUser();
  if (!data.user) return { state: "nessuna" };
  setContext({ user_id: data.user.id });
  const access = await accessOf(data.user.id);
  if (!hasAnyAccess(access)) return { state: "nessuna" };
  // il team entra solo con il codice verificato di recente (stessa regola del pannello)
  if (access.team && !(await checkSupportSession()).ok) return { state: "codice", access };
  return { state: "pronta", userId: data.user.id, access };
}

/** URL della destinazione: pannello, oppure web app esercente (o la pagina dell'app da cui si era partiti). */
export function destinationUrl(destination: AuthDestination, ritorno: unknown): string {
  if (destination === "interno") return "/interno";
  const extraOrigins = (process.env.MERCHANT_APP_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim().replace(/\/$/, ""))
    .filter(Boolean);
  return (
    safeReturnUrl(ritorno, { siteOrigin: siteOrigin(), extraOrigins, appPath: MERCHANT_APP_PATH }) ?? merchantAppUrl()
  );
}

/**
 * Fine del login: URL in cui entrare, oppure "/accesso/scegli" per chi ha sia il pannello sia
 * un negozio e non stava aprendo nessuno dei due. Scrive auth.login.destination.
 */
export function finishLogin(
  userId: string,
  access: Access,
  wanted: AuthDestination | null,
  ritorno: unknown,
  scegli = "/accesso/scegli",
): string {
  const d = destinationFor(access, wanted);
  if (d.kind === "scegli") return scegli;
  log.event("auth.login.destination", { user_id: userId, destination: d.destination, how: d.how });
  return destinationUrl(d.destination, ritorno);
}

/** Uscita dalla sessione web (pannello o app): la sessione si chiude per entrambi. */
export async function logoutWeb(from: "interno" | "app"): Promise<void> {
  const sb = await cookieSessionClient();
  const { data } = await sb.auth.getUser();
  await sb.auth.signOut({ scope: "local" });
  if (data.user) log.event("auth.logout", { user_id: data.user.id, from });
}
