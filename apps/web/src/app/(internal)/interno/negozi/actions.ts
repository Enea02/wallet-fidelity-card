"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supportAction, type ActionResult } from "@/lib/support/run";
import { createShop, LegalInput, NewShopInput, parseForm, setShopStatus, updateLegal } from "@/lib/support/shops";
import { formText } from "../_ui/format";

export async function createShopAction(_: ActionResult<unknown> | null, f: FormData): Promise<ActionResult<unknown>> {
  const r = await supportAction("negozio-nuovo", (user) =>
    createShop(
      parseForm(NewShopInput, {
        name: formText(f, "name"),
        slug: formText(f, "slug"),
        ownerName: formText(f, "ownerName"),
        ownerEmail: formText(f, "ownerEmail"),
        legalName: formText(f, "legalName"),
        vatNumber: formText(f, "vatNumber"),
        privacyEmail: formText(f, "privacyEmail"),
      }),
      user,
    ),
  );
  if (r.ok) redirect(`/interno/negozi/${(r.data as { id: string }).id}?creato=1`);
  return r;
}

export async function shopStatusAction(_: ActionResult<unknown> | null, f: FormData): Promise<ActionResult<unknown>> {
  const id = formText(f, "shopId");
  const status = formText(f, "status") === "suspended" ? "suspended" : "active";
  const r = await supportAction(
    status === "suspended" ? "negozio-sospendi" : "negozio-riattiva",
    (user) => setShopStatus(id, status, formText(f, "reason"), user),
    {
      message: (d) =>
        !d.changed
          ? "Lo stato era già questo: nessuna modifica."
          : status === "suspended"
            ? "Negozio sospeso: app e iscrizioni bloccate, carte disattivate entro qualche minuto."
            : "Negozio riattivato: le carte tornano attive entro qualche minuto.",
    },
  );
  revalidatePath(`/interno/negozi/${id}`);
  return r;
}

export async function shopLegalAction(_: ActionResult<unknown> | null, f: FormData): Promise<ActionResult<unknown>> {
  const id = formText(f, "shopId");
  const r = await supportAction(
    "negozio-informativa",
    (user) =>
      updateLegal(
        id,
        parseForm(LegalInput, {
          legalName: formText(f, "legalName"),
          vatNumber: formText(f, "vatNumber"),
          privacyEmail: formText(f, "privacyEmail"),
        }),
        user,
      ),
    { message: (d) => (d.changed === 0 ? "Nessuna modifica." : "Dati per l'informativa salvati.") },
  );
  revalidatePath(`/interno/negozi/${id}`);
  return r;
}
