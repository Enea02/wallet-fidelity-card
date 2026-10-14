import { AppError } from "@loyalty/shared/errors";
import { redactString } from "@loyalty/shared/logger";
import { log } from "./logger";

const MAX_PROVIDER_RESPONSE = 4 * 1024;

export interface ExternalCall {
  /** Nome del servizio: google, apple, twilio, stripe, supabase-storage… */
  provider: string;
  /** Cosa stiamo facendo, in italiano: "aggiornamento carta", "invio OTP"… */
  operation: string;
  url: string;
  method?: string;
  headers?: Record<string, string>;
  /** Oggetto → JSON; stringa → inviata così com'è. */
  body?: unknown;
  /** Numero del tentativo (i retry li gestisce chi chiama). */
  attempt?: number;
  /** Id dell'oggetto coinvolto presso il provider (es. id della carta Google). */
  objectId?: string;
  timeoutMs?: number;
  /**
   * true = external.call.ok/failed a livello debug: l'esito lo registra chi chiama con un evento
   * più specifico (es. wallet.google.patch.failed), così un errore produce una sola riga error.
   */
  quiet?: boolean;
}

const alreadyLogged = (e: AppError) => Object.assign(e, { logged: true });

const truncate = (s: string, max: number) => (s.length > max ? `${s.slice(0, max)}… [troncato]` : s);

/** URL senza query string: i parametri possono contenere token. */
function endpointOf(url: string): string {
  const u = new URL(url);
  return `${u.origin}${u.pathname}`;
}

function payloadBody(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return truncate(text, MAX_PROVIDER_RESPONSE);
  }
}

/**
 * Chiamata HTTP a un servizio esterno, sempre loggata: `external.call.ok` o `external.call.failed`
 * con provider, endpoint, status, durata, tentativo e (in errore) la risposta del provider
 * redatta e troncata a 4 KB. In modalità diagnostica registra anche i payload.
 * Su risposta non 2xx o errore di rete lancia un AppError (E_EXTERNAL_HTTP / E_EXTERNAL_UNAVAILABLE)
 * già loggato: chi lo gestisce non deve loggarlo di nuovo come errore.
 */
export async function fetchExternal(call: ExternalCall): Promise<Response> {
  const method = call.method ?? "GET";
  const attempt = call.attempt ?? 1;
  const timeoutMs = call.timeoutMs ?? 10_000;
  const level = call.quiet ? ({ level: "debug" } as const) : {};
  const endpoint = endpointOf(call.url);
  const base = {
    provider: call.provider,
    operation: call.operation,
    method,
    endpoint,
    attempt,
    object_id: call.objectId ?? null,
  };
  const bodyText =
    call.body === undefined ? undefined : typeof call.body === "string" ? call.body : JSON.stringify(call.body);

  if (bodyText !== undefined && log.isEnabled("debug")) {
    log.event("external.call.payload", {
      direction: "richiesta",
      provider: call.provider,
      operation: call.operation,
      size_bytes: bodyText.length,
      body: payloadBody(bodyText),
    });
  }

  const started = performance.now();
  const duration = () => Math.round(performance.now() - started);
  let res: Response;
  try {
    res = await fetch(call.url, {
      method,
      headers: {
        ...(bodyText !== undefined && typeof call.body !== "string" && { "content-type": "application/json" }),
        ...call.headers,
      },
      ...(bodyText !== undefined && { body: bodyText }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    const timedOut = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    const reason = timedOut
      ? `timeout dopo ${timeoutMs} ms`
      : `errore di rete: ${e instanceof Error ? e.message : String(e)}`;
    log.event(
      "external.call.failed",
      {
        ...base,
        http_status: null,
        duration_ms: duration(),
        error_code: "E_EXTERNAL_UNAVAILABLE",
        provider_response: reason,
      },
      level,
    );
    throw alreadyLogged(
      new AppError(
        "E_EXTERNAL_UNAVAILABLE",
        `${call.provider} non raggiungibile (${call.operation}): ${reason}`,
        { provider: call.provider, endpoint, provider_response: reason, duration_ms: duration() },
        { cause: e },
      ),
    );
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const providerResponse = truncate(redactString(text), MAX_PROVIDER_RESPONSE) || "(risposta vuota)";
    log.event(
      "external.call.failed",
      {
        ...base,
        http_status: res.status,
        duration_ms: duration(),
        error_code: "E_EXTERNAL_HTTP",
        provider_response: providerResponse,
      },
      level,
    );
    throw alreadyLogged(
      new AppError("E_EXTERNAL_HTTP", `${call.provider} ha risposto ${res.status} (${call.operation})`, {
        provider: call.provider,
        endpoint,
        http_status: res.status,
        provider_response: providerResponse,
        duration_ms: duration(),
      }),
    );
  }

  log.event("external.call.ok", { ...base, http_status: res.status, duration_ms: duration() }, level);
  if (log.isEnabled("debug")) {
    const text = await res
      .clone()
      .text()
      .catch(() => "");
    log.event("external.call.payload", {
      direction: "risposta",
      provider: call.provider,
      operation: call.operation,
      size_bytes: text.length,
      body: payloadBody(text),
    });
  }
  return res;
}
