"use server";

import { revalidatePath } from "next/cache";
import { resyncPrepaid } from "@/lib/support/prepaid";
import { supportAction, type ActionResult } from "@/lib/support/run";
import { formText } from "../_ui/format";

export async function resyncPrepaidAction(
  _: ActionResult<unknown> | null,
  f: FormData,
): Promise<ActionResult<unknown>> {
  const id = formText(f, "cardId");
  const r = await supportAction("tessera-risincronizza", (user) => resyncPrepaid(id, formText(f, "reason"), user), {
    message: (d) =>
      d.ok
        ? "Tessera risincronizzata: Google ha accettato lo stato completo."
        : "Google non ha accettato l'aggiornamento: il motivo è nella timeline qui sotto; i nuovi tentativi partono da soli.",
  });
  revalidatePath(`/interno/tessere/${id}`);
  return r;
}
