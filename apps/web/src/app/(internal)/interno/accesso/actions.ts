"use server";

import { redirect } from "next/navigation";
import { codeStep, passwordStep } from "@/lib/support/login";
import { loginAction, type ActionResult } from "@/lib/support/run";

const text = (f: FormData, k: string) => {
  const v = f.get(k);
  return typeof v === "string" ? v : "";
};

export async function passwordAction(_: ActionResult<unknown> | null, form: FormData): Promise<ActionResult<unknown>> {
  const r = await loginAction("accesso", () => passwordStep(text(form, "email"), text(form, "password")));
  if (r.ok) redirect(`/interno/accesso/${r.data}`);
  return r;
}

export async function codeAction(_: ActionResult<unknown> | null, form: FormData): Promise<ActionResult<unknown>> {
  const factorId = text(form, "factorId") || undefined;
  const r = await loginAction(factorId ? "collega" : "codice", () => codeStep(text(form, "code"), factorId));
  if (r.ok) redirect("/interno");
  return r;
}
