import type { HandoffReason } from "@loyalty/shared/api";
import { api, ApiError } from "../api";
import { config } from "../config";
import { log } from "../diagnostics/logger";
import { peekInitialPath } from "../navigation/initial-path";
import { withBase } from "../web-base";
import { supabase, WEB_AUTH_KEY } from "./supabase";

/*
 * Web app esercente e login unico: sul web non c'è una schermata di accesso nell'app, si entra da
 * /accesso (sullo stesso server, stesso modulo del pannello interno) e la sessione sta nei cookie
 * httpOnly. Qui: l'indirizzo del login, il ritorno alla pagina di partenza e il passaggio al server
 * della sessione aperta dal link dell'email.
 */

/** Pagina dell'app da cui si è partiti (per tornarci dopo il login), null se è la schermata iniziale. */
function returnUrl(): string | null {
  if (typeof window === "undefined") return null;
  const path = peekInitialPath();
  if (!path || path.startsWith("/accedi")) return null;
  return `${window.location.origin}${withBase(path)}`;
}

/** Indirizzo del login unico, con la pagina a cui tornare. */
export function webLoginUrl(reason?: "sessione"): string {
  const q = new URLSearchParams({ dest: "app" });
  const back = returnUrl();
  if (back) q.set("ritorno", back);
  if (reason) q.set("errore", reason);
  return `${config.apiUrl}/accesso?${q.toString()}`;
}

/** Porta al login unico (sostituisce la pagina: "indietro" non torna a una schermata vuota). */
export function goToWebLogin(reason?: "sessione"): void {
  if (typeof window !== "undefined") window.location.replace(webLoginUrl(reason));
}

/** Dimentica la copia locale della sessione SENZA chiuderla (resta valida nei cookie del server). */
export function forgetLocalSession(): void {
  void supabase.auth.stopAutoRefresh();
  if (typeof localStorage === "undefined") return;
  for (const key of Object.keys(localStorage)) if (key.startsWith(WEB_AUTH_KEY)) localStorage.removeItem(key);
}

/**
 * Invito o nuova password: la sessione aperta dal link dell'email passa ai cookie del server
 * (token di accesso nell'header, aggiunto dal client API; token di rinnovo nel body), poi la copia
 * locale si dimentica. Restituisce false se il server non l'ha accettata.
 */
export async function handoffLocalSession(reason: HandoffReason): Promise<boolean> {
  const { data } = await supabase.auth.getSession();
  const refreshToken = data.session?.refresh_token;
  if (!refreshToken) return false;
  try {
    await api.call("sessionHandoff", { body: { refreshToken, reason } });
  } catch (e) {
    // gli errori dell'API li registra già il client (app.api.error)
    if (e instanceof ApiError) return false;
    log.event("app.error.unexpected", {
      where: "il passaggio della sessione al server",
      error_name: e instanceof Error ? e.name : typeof e,
      error_message: e instanceof Error ? e.message : String(e),
    });
    return false;
  }
  forgetLocalSession();
  return true;
}
