"use server";

import { redirect } from "next/navigation";
import { logoutWeb } from "@/lib/access";
import { supportAction } from "@/lib/support/run";

/** Uscita dal pannello: chiude la sessione web del login unico (anche la web app esercente). */
export async function logoutAction(): Promise<void> {
  await supportAction("esci", (user) => logoutWeb("interno").then(() => user.name));
  redirect("/accesso");
}
