"use server";

import { AppError } from "@loyalty/shared/errors";
import { redirect } from "next/navigation";
import { parseDest } from "@/lib/access-rules";
import { currentAccess, destinationUrl, finishLogin, loginPassword } from "@/lib/access";
import { log } from "@/lib/observability/logger";
import { codeStep } from "@/lib/support/login";
import { loginAction, type ActionResult } from "@/lib/support/run";
import { carryOf, carryQuery } from "./params";

const text = (f: FormData, k: string) => {
  const v = f.get(k);
  return typeof v === "string" ? v : "";
};

const carryFrom = (form: FormData) =>
  carryOf({ dest: text(form, "dest") || undefined, ritorno: text(form, "ritorno") || undefined });

/** Passo 1: password. Il team va al secondo fattore, lo staff entra subito nella web app. */
export async function passwordAction(_: ActionResult<unknown> | null, form: FormData): Promise<ActionResult<unknown>> {
  const carry = carryFrom(form);
  const r = await loginAction("password", async () => {
    const res = await loginPassword(text(form, "email"), text(form, "password"));
    if (res.next === "codice" || res.next === "collega") return `/accesso/${res.next}${carryQuery(carry)}`;
    return finishLogin(res.userId, res.access, carry.dest, carry.ritorno);
  });
  if (r.ok) redirect(r.data);
  return r;
}

/** Passo 2 del team: codice dell'app di autenticazione (o collegamento al primo accesso), poi la destinazione. */
export async function codeAction(_: ActionResult<unknown> | null, form: FormData): Promise<ActionResult<unknown>> {
  const factorId = text(form, "factorId") || undefined;
  const carry = carryFrom(form);
  const r = await loginAction(factorId ? "collega" : "codice", async () => {
    await codeStep(text(form, "code"), factorId);
    const now = await currentAccess();
    if (now.state !== "pronta") throw new AppError("E_SUPPORT_MFA_REQUIRED", "codice accettato ma sessione non aal2");
    return finishLogin(now.userId, now.access, carry.dest, carry.ritorno);
  });
  if (r.ok) redirect(r.data);
  return r;
}

/** Schermata di scelta (team e staff insieme): pannello interno o web app esercente. */
export async function chooseAction(_: ActionResult<unknown> | null, form: FormData): Promise<ActionResult<unknown>> {
  const destination = parseDest(text(form, "dest"));
  const carry = carryFrom(form);
  const r = await loginAction("scelta", async () => {
    const now = await currentAccess();
    if (now.state !== "pronta" || !destination) return `/accesso${carryQuery(carry)}`;
    const allowed = destination === "interno" ? now.access.team : now.access.shops > 0;
    if (!allowed) return "/accesso/scegli";
    log.event("auth.login.destination", { user_id: now.userId, destination, how: "scelta" });
    return destinationUrl(destination, carry.ritorno);
  });
  if (r.ok) redirect(r.data);
  return r;
}
