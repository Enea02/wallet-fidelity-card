import { createHash } from "node:crypto";
import { after } from "next/server";
import { isRequestId, newRequestId, supportCodeFromRequestId } from "@loyalty/shared/logging/request-id";
import { getContext, runWithContext } from "./context";
import { refreshDiagnosticModes } from "./diagnostic";
import { flushLogs } from "./db-sink";
import { classifyError, errorResponse } from "./errors";
import { log } from "./logger";

const MAX_PAYLOAD_BYTES = 8 * 1024;

function hashIp(req: Request): string {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "sconosciuto";
  return createHash("sha256")
    .update(`${process.env.IP_HASH_SALT ?? ""}:${ip}`)
    .digest("hex")
    .slice(0, 16);
}

function parsePayload(text: string): unknown {
  const cut = text.length > MAX_PAYLOAD_BYTES ? `${text.slice(0, MAX_PAYLOAD_BYTES)}… [troncato]` : text;
  try {
    return JSON.parse(cut);
  } catch {
    return cut;
  }
}

/**
 * Avvolge un route handler: request_id (riusa X-Request-Id se è un ULID valido, altrimenti
 * lo crea) restituito in risposta, log di inizio e fine con durata, payload in modalità
 * diagnostica, eccezioni convertite in `{ error: { code, message, support_code } }`.
 *
 * Un errore si logga una sola volta: errori del catalogo → `http.request.end` a livello warn
 * (info se un evento di dominio l'ha già registrato, `AppError.logged`);
 * errori imprevisti → solo `http.request.failed` a livello error, con lo stack.
 */
export function withApi<Args extends unknown[]>(
  handler: (req: Request, ...args: Args) => Promise<Response>,
  /** quiet: inizio e fine richiesta a livello debug (es. il cron, chiamato ogni minuto). */
  opts: { quiet?: boolean } = {},
): (req: Request, ...args: Args) => Promise<Response> {
  const okLevel = opts.quiet ? ({ level: "debug" } as const) : {};
  return async (req, ...args) => {
    const started = performance.now();
    const incoming = req.headers.get("x-request-id");
    const request_id = incoming && isRequestId(incoming) ? incoming : newRequestId();
    const support_code = supportCodeFromRequestId(request_id);
    const method = req.method;
    const route = new URL(req.url).pathname;
    const platform = req.headers.get("x-platform") ?? "sconosciuta";
    const app_version = req.headers.get("x-app-version") ?? "n/d";
    const build = req.headers.get("x-app-build");

    const ip_hash = hashIp(req);
    const ctx = { request_id, route, method, platform, app_version, ip_hash, ...(build !== null && { build }) };
    return runWithContext(ctx, async () => {
      await refreshDiagnosticModes();
      log.event("http.request.start", { method, route, platform, app_version, ip_hash }, okLevel);
      // il body serve solo in modalità diagnostica, che si decide quando il contesto è completo
      const requestText =
        method === "GET" || method === "HEAD"
          ? Promise.resolve("")
          : req
              .clone()
              .text()
              .catch(() => "");
      const duration = () => Math.round(performance.now() - started);

      let res: Response;
      try {
        res = await handler(req, ...args);
        log.event(
          "http.request.end",
          {
            method,
            route,
            status: res.status,
            duration_ms: duration(),
            error_code: null,
            error_message: null,
            support_code,
          },
          okLevel,
        );
      } catch (e) {
        const { error, unexpected } = classifyError(e);
        const common = { method, route, status: error.status, duration_ms: duration(), support_code };
        if (unexpected) {
          log.event(
            "http.request.failed",
            { ...common, error_code: error.code, error_message: error.message },
            { error: error.cause ?? error },
          );
        } else {
          // già registrato da un evento (es. stamp.add.rejected_cooldown): qui solo l'esito, a info
          log.event(
            "http.request.end",
            { ...common, error_code: error.code, error_message: error.message },
            { level: error.logged ? "info" : "warn" },
          );
        }
        res = errorResponse(error, request_id);
      }

      if (log.isEnabled("debug")) await logPayloads(req, res, requestText);
      try {
        res.headers.set("x-request-id", request_id);
      } catch {
        // header immutabili (es. risposta inoltrata da fetch): si ricrea la risposta
        res = new Response(res.body, res);
        res.headers.set("x-request-id", request_id);
      }
      flushAfterResponse();
      return res;
    });
  };
}

async function logPayloads(req: Request, res: Response, requestText: Promise<string>) {
  const route = getContext()?.route ?? new URL(req.url).pathname;
  const reqText = await requestText;
  if (reqText) {
    log.event("http.request.payload", {
      direction: "richiesta",
      method: req.method,
      route,
      size_bytes: reqText.length,
      body: parsePayload(reqText),
    });
  }
  const resText = await res
    .clone()
    .text()
    .catch(() => "");
  log.event("http.request.payload", {
    direction: "risposta",
    method: req.method,
    route,
    size_bytes: resText.length,
    body: parsePayload(resText),
  });
}

/** Copia dei log della richiesta in Postgres dopo la risposta (fuori da Next: al timer di db-sink). */
function flushAfterResponse() {
  try {
    after(flushLogs);
  } catch {
    void flushLogs();
  }
}
