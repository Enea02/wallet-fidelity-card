"use server";

import { revalidatePath } from "next/cache";
import { resyncCard } from "@/lib/support/card-status";
import { supportAction, type ActionResult } from "@/lib/support/run";
import { formText } from "../_ui/format";

export async function resyncCardAction(_: ActionResult<unknown> | null, f: FormData): Promise<ActionResult<unknown>> {
  const id = formText(f, "customerId");
  const r = await supportAction(
    "carta-risincronizza",
    (user) => resyncCard(formText(f, "shopId"), id, formText(f, "reason"), user),
    {
      message: (d) =>
        d.ok
          ? "Carta risincronizzata: Google ha accettato lo stato completo."
          : "Google non ha accettato l'aggiornamento: il motivo è nella timeline qui sotto; i nuovi tentativi partono da soli.",
    },
  );
  revalidatePath(`/interno/clienti/${id}`);
  return r;
}
