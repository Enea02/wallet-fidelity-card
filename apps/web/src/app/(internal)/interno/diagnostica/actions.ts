"use server";

import type { DiagnosticScopeType } from "@loyalty/shared/logging/events";
import { revalidatePath } from "next/cache";
import { disableDiagnostic, enableDiagnostic } from "@/lib/support/diagnostics";
import { supportAction, type ActionResult } from "@/lib/support/run";
import { dateTime, formText } from "../_ui/format";

const SCOPES: readonly DiagnosticScopeType[] = ["shop", "staff_user", "customer"];

export async function enableDiagnosticAction(
  _: ActionResult<unknown> | null,
  f: FormData,
): Promise<ActionResult<unknown>> {
  const scopeType = formText(f, "scopeType") as DiagnosticScopeType;
  const r = await supportAction(
    "diagnostica-attiva",
    (user) =>
      enableDiagnostic(
        {
          scopeType: SCOPES.includes(scopeType) ? scopeType : "shop",
          scopeId: formText(f, "scopeId"),
          level: formText(f, "level") === "trace" ? "trace" : "debug",
          hours: Number(formText(f, "hours")),
          reason: formText(f, "reason"),
        },
        user,
      ),
    {
      message: (m) =>
        `Modalità diagnostica ${m.level} attiva fino al ${dateTime(m.expires_at)} (i server la applicano entro 30 secondi).`,
    },
  );
  revalidatePath(formText(f, "back") || "/interno/diagnostica");
  return r;
}

export async function disableDiagnosticAction(
  _: ActionResult<unknown> | null,
  f: FormData,
): Promise<ActionResult<unknown>> {
  const r = await supportAction("diagnostica-disattiva", (user) => disableDiagnostic(formText(f, "id"), user), {
    message: () => "Modalità diagnostica disattivata: i log tornano al livello normale entro 30 secondi.",
  });
  revalidatePath(formText(f, "back") || "/interno/diagnostica");
  return r;
}
