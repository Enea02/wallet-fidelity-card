import { errors, type ErrorCode } from "@loyalty/shared/errors";

/** Errore di Supabase Auth (login, password) tradotto nel catalogo, con il motivo per il log. */
export interface AuthFailure {
  code: ErrorCode;
  userMessage: string;
  reason: string;
}

export function authFailure(
  e: { status?: number | undefined; code?: string | undefined; message?: string } | null,
): AuthFailure {
  const status = e?.status ?? 0;
  const code = e?.code ?? "";
  const make = (c: ErrorCode, reason: string, userMessage: string = errors[c].userMessage): AuthFailure => ({
    code: c,
    userMessage,
    reason,
  });
  if (status === 0 || /fetch|network/i.test(e?.message ?? ""))
    return make("E_NETWORK", "server di autenticazione non raggiungibile");
  if (status === 429 || code === "over_request_rate_limit" || code === "over_email_send_rate_limit")
    return make(
      "E_RATE_LIMITED",
      "troppi tentativi ravvicinati",
      "Troppi tentativi: aspetta qualche minuto e riprova.",
    );
  if (code === "invalid_credentials") return make("E_LOGIN_FAILED", "email o password non corrette");
  if (code === "email_not_confirmed")
    return make(
      "E_LOGIN_FAILED",
      "invito non ancora accettato",
      "Non hai ancora accettato l'invito: apri il link che ti è arrivato via email.",
    );
  if (code === "weak_password" || code === "same_password")
    return make(
      "E_VALIDATION",
      code === "weak_password" ? "password troppo debole" : "password uguale alla precedente",
      code === "weak_password"
        ? "La password è troppo debole: usa almeno 8 caratteri."
        : "Scegli una password diversa da quella attuale.",
    );
  if (status === 401 || status === 403 || code === "session_not_found" || code === "bad_jwt")
    return make("E_LINK_INVALID", "link scaduto o già usato", "Il link è scaduto o è già stato usato.");
  return make("E_INTERNAL", `errore di autenticazione ${status}${code ? ` (${code})` : ""}`);
}
