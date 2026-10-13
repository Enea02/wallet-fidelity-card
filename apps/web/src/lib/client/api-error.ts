/**
 * Messaggio da mostrare per una risposta d'errore delle API
 * (`{ error: { code, message, support_code } }`): testo per l'utente + codice assistenza.
 */
export function apiErrorMessage(json: unknown): string {
  const err = (json as { error?: { message?: unknown; support_code?: unknown } } | null)?.error;
  const message = typeof err?.message === "string" ? err.message : "Si è verificato un errore. Riprova.";
  return typeof err?.support_code === "string" ? `${message} (codice assistenza ${err.support_code})` : message;
}
