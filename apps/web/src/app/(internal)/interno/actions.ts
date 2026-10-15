"use server";

import { redirect } from "next/navigation";
import { logout } from "@/lib/support/login";
import { supportAction } from "@/lib/support/run";

export async function logoutAction(): Promise<void> {
  await supportAction("esci", (user) => logout(user.name));
  redirect("/interno/accesso");
}
