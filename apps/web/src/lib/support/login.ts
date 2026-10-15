import "server-only";
import { AppError } from "@loyalty/shared/errors";
import type { SupportLoginStage } from "@loyalty/shared/logging/events";
import { maskEmail } from "@loyalty/shared/logger";
import { setContext } from "../observability/context";
import { log } from "../observability/logger";
import { memberOf, supportAuthClient } from "./session";

/*
 * Accesso al pannello interno: 1) email e password; 2) al primo accesso si collega l'app di
 * autenticazione (QR TOTP), poi si chiede sempre il codice a 6 cifre. Solo dopo il codice la
 * sessione è aal2 e il pannello si apre.
 */

const ISSUER = "Loyalty Wallet · pannello interno";

function failed(email: string, stage: SupportLoginStage, reason: string): never {
  log.event("support.login.failed", { email: maskEmail(email), stage, reason });
  const err = new AppError("E_SUPPORT_LOGIN_FAILED", `accesso al pannello rifiutato al passo ${stage}: ${reason}`, {
    stage,
  });
  err.logged = true;
  throw err;
}

export type NextStep = "codice" | "collega";

/** Passo 1: password. Chi non è nel team non entra (e la sessione appena aperta si chiude). */
export async function passwordStep(emailIn: string, password: string): Promise<NextStep> {
  const email = emailIn.trim().toLowerCase();
  const sb = await supportAuthClient();
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error || !data.user) failed(email, "password", "email o password non corrette");
  setContext({ user_id: data.user.id });

  if (!(await memberOf(data.user.id))) {
    await sb.auth.signOut();
    log.event("support.access.denied", { route: "/interno/accesso", reason: "non nel team", email: maskEmail(email) });
    const err = new AppError("E_SUPPORT_FORBIDDEN", `${data.user.id} non è nel team interno`);
    err.logged = true;
    throw err;
  }
  const { data: factors } = await sb.auth.mfa.listFactors();
  return factors?.totp.some((f) => f.status === "verified") ? "codice" : "collega";
}

async function sessionUser(stage: SupportLoginStage) {
  const sb = await supportAuthClient();
  const { data } = await sb.auth.getUser();
  if (!data.user) {
    const err = new AppError("E_SUPPORT_UNAUTHORIZED", `passo ${stage} senza sessione: ripartire dalla password`);
    throw err;
  }
  const member = await memberOf(data.user.id);
  if (!member) throw new AppError("E_SUPPORT_FORBIDDEN", `${data.user.id} non è nel team interno`);
  setContext({ user_id: data.user.id });
  return { sb, user: data.user, member };
}

export interface Enrollment {
  factorId: string;
  /** QR da inquadrare con l'app di autenticazione (SVG come data URL). */
  qrCode: string;
  /** Lo stesso segreto da scrivere a mano se il QR non si legge. */
  secret: string;
}

/** Primo accesso: nuovo fattore TOTP da collegare (i tentativi precedenti non completati si tolgono). */
export async function startEnrollment(): Promise<Enrollment> {
  const { sb } = await sessionUser("collegamento");
  const { data: factors } = await sb.auth.mfa.listFactors();
  for (const f of factors?.all ?? []) {
    if (f.factor_type === "totp" && f.status === "unverified") await sb.auth.mfa.unenroll({ factorId: f.id });
  }
  const { data, error } = await sb.auth.mfa.enroll({
    factorType: "totp",
    issuer: ISSUER,
    friendlyName: `Pannello interno ${new Date().toISOString().slice(0, 10)}`,
  });
  if (error || !data) throw new Error(`collegamento dell'app di autenticazione non avviato: ${error?.message}`);
  return { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret };
}

/** Codice dell'app di autenticazione: completa il collegamento (primo accesso) o l'accesso. */
export async function codeStep(code: string, enrollingFactorId?: string): Promise<void> {
  const stage: SupportLoginStage = enrollingFactorId ? "collegamento" : "codice";
  const { sb, user, member } = await sessionUser(stage);
  const email = user.email ?? "";
  let factorId = enrollingFactorId;
  if (!factorId) {
    const { data: factors } = await sb.auth.mfa.listFactors();
    factorId = factors?.totp.find((f) => f.status === "verified")?.id;
    if (!factorId) failed(email, stage, "nessuna app di autenticazione collegata");
  }
  const clean = code.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(clean)) failed(email, stage, "il codice deve avere 6 cifre");
  const { error } = await sb.auth.mfa.challengeAndVerify({ factorId, code: clean });
  if (error) failed(email, stage, "codice dell'app di autenticazione non valido o scaduto");
  log.event("support.login", { support_name: member.name, factor_enrolled: stage === "collegamento" });
}

export async function logout(name: string): Promise<void> {
  const sb = await supportAuthClient();
  await sb.auth.signOut();
  log.event("support.logout", { support_name: name });
}
