"use client";

import { newRequestId, supportCodeFromRequestId } from "@loyalty/shared/logging/request-id";

/**
 * Chiamata alle API pubbliche dal browser: request_id generato qui (X-Request-Id), così anche un
 * errore di rete ha il suo codice assistenza ERR-XXXXX da comunicare al negozio.
 */
export class PublicApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly supportCode: string,
  ) {
    super(message);
  }
}

export async function publicPost<T>(path: string, body: unknown): Promise<T> {
  const requestId = newRequestId();
  let res: Response;
  try {
    res = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json", "x-request-id": requestId, "x-platform": "public-web" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new PublicApiError(
      "Connessione assente o instabile. Controlla la rete e riprova.",
      "E_NETWORK",
      supportCodeFromRequestId(requestId),
    );
  }
  const json = (await res.json().catch(() => null)) as {
    error?: { code: string; message: string; support_code: string };
  } | null;
  if (!res.ok) {
    throw new PublicApiError(
      json?.error?.message ?? "Si è verificato un errore. Riprova.",
      json?.error?.code ?? "E_INTERNAL",
      json?.error?.support_code ?? supportCodeFromRequestId(requestId),
    );
  }
  return json as T;
}
