import { merchantRoute, preflight } from "@/lib/api/merchant";
import { log } from "@/lib/observability/logger";

export const runtime = "nodejs";

/**
 * Uscita dalla web app esercente: chiude la sessione web (cookie), quindi anche il pannello interno
 * per chi è nel team. Con il token Bearer (app native) non c'è niente da chiudere qui: l'app
 * dimentica il token da sé.
 */
export const POST = merchantRoute("logout", async ({ user, session }) => {
  if (session) {
    await session.sb.auth.signOut({ scope: "local" });
    log.event("auth.logout", { user_id: user.id, from: "app" });
  }
  return { ok: true as const };
});
export const OPTIONS = preflight;
