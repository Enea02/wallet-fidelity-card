import { AppError } from "@loyalty/shared/errors";
import { merchantRoute, preflight } from "@/lib/api/merchant";
import { bearerToken } from "@/lib/auth";
import { log } from "@/lib/observability/logger";
import { requestSessionClient } from "@/lib/web-session";

export const runtime = "nodejs";

/**
 * Web app esercente: la sessione aperta dal link dell'email (invito, nuova password) passa ai cookie
 * httpOnly della sessione web. Token di accesso nell'header Authorization (già verificato da
 * merchantRoute), token di rinnovo nel body; dopo, l'app dimentica la sua copia.
 */
export const POST = merchantRoute("sessionHandoff", async ({ req, user, body, setCookies }) => {
  const accessToken = bearerToken(req);
  if (!accessToken) {
    throw new AppError(
      "E_VALIDATION",
      "passaggio della sessione senza token Bearer: serve la sessione aperta dal link dell'email",
      { fields: ["authorization"] },
      { userMessage: "Richiesta non valida: apri di nuovo il link dell'email." },
    );
  }
  // client senza i cookie della richiesta: la sessione nuova sostituisce l'eventuale precedente
  const { sb, pending } = requestSessionClient(new Request(req.url));
  const { error } = await sb.auth.setSession({ access_token: accessToken, refresh_token: body.refreshToken });
  if (error) throw new AppError("E_AUTH_INVALID", `passaggio della sessione al server non riuscito: ${error.message}`);
  setCookies(pending);
  log.event("auth.session.handoff", { user_id: user.id, reason: body.reason });
  return { ok: true as const };
});
export const OPTIONS = preflight;
