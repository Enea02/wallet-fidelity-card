"use server";

import { revalidatePath } from "next/cache";
import { resyncCard } from "@/lib/support/card-status";
import { deleteCustomerGdpr } from "@/lib/support/gdpr";
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

export async function deleteCustomerAction(
  _: ActionResult<unknown> | null,
  f: FormData,
): Promise<ActionResult<unknown>> {
  const id = formText(f, "customerId");
  const r = await supportAction(
    "cliente-cancella",
    (user) =>
      deleteCustomerGdpr(
        formText(f, "shopId"),
        id,
        formText(f, "confirm"),
        formText(f, "shortCode"),
        formText(f, "reason"),
        user,
      ),
    { message: () => "Dati del cliente cancellati; la carta nel wallet viene disattivata." },
  );
  revalidatePath(`/interno/clienti/${id}`);
  return r;
}
