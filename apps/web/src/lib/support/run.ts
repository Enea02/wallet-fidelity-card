import "server-only";
import { createHash } from "node:crypto";
import { AppError, type ErrorCode } from "@loyalty/shared/errors";
import { newRequestId, supportCodeFromRequestId } from "@loyalty/shared/logging/request-id";
import { headers } from "next/headers";
import { redirect, unstable_rethrow } from "next/navigation";
import { after } from "next/server";
import { runWithContext } from "../observability/context";
import { flushLogs } from "../observability/db-sink";
import { refreshDiagnosticModes } from "../observability/diagnostic";
import { classifyError } from "../observability/errors";
import { log } from "../observability/logger";
import { requireSupport, type SupportUser } from "./session";

/*
 * Cornice comune di pagine e azioni del pannello interno, come withApi + merchantRoute per le API:
 * request_id, contesto di log (platform "interno", ruolo support), accesso solo al team con 2FA,
 * esito della richiesta nel log, errori del catalogo restituiti al modulo con il codice assistenza.
 */

const PLATFORM = "interno";

async function requestContext(route: string) {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "sconosciuto";
  const ip_hash = createHash("sha256")
    .update(`${process.env.IP_HASH_SALT ?? ""}:${ip}`)
    .digest("hex")
    .slice(0, 16);
  return { request_id: newRequestId(), route, method: "GET", platform: PLATFORM, app_version: "n/d", ip_hash };
}

function flushAfter() {
  try {
    after(flushLogs);
  } catch {
    void flushLogs();
  }
}

const LOGIN_FOR: Partial<Record<ErrorCode, string>> = {
  E_SUPPORT_UNAUTHORIZED: "/interno/accesso",
  E_SUPPORT_FORBIDDEN: "/interno/accesso?errore=team",
  E_SUPPORT_MFA_REQUIRED: "/interno/accesso/codice",
};

/** Pagina del pannello: senza sessione valida rimanda all'accesso. */
export async function supportPage<T>(route: string, render: (user: SupportUser) => Promise<T>): Promise<T> {
  const ctx = await requestContext(route);
  return runWithContext(ctx, async () => {
    try {
      await refreshDiagnosticModes();
      const user = await requireSupport(route);
      return await render(user);
    } catch (e) {
      const target = e instanceof AppError ? LOGIN_FOR[e.code] : undefined;
      if (target) redirect(target);
      throw e;
    } finally {
      flushAfter();
    }
  });
}

export type ActionResult<T = undefined> =
  { ok: true; data: T; message?: string } | { ok: false; code: ErrorCode; message: string; supportCode: string };

/**
 * Azione del pannello (Server Action) riservata al team con 2FA: inizio e fine nel log come una richiesta API, così la timeline
 * le raggruppa per request_id; gli errori tornano al modulo con messaggio e codice assistenza.
 * redirect() e notFound() passano invariati.
 */
export async function supportAction<T>(
  name: string,
  run: (user: SupportUser) => Promise<T>,
  opts: { message?: (data: T) => string } = {},
): Promise<ActionResult<T>> {
  return actionRun(name, (route) => requireSupport(route).then(run), opts);
}

/** Passi dell'accesso (password, codice): stessa cornice, senza sessione richiesta. */
export async function loginAction<T>(name: string, run: () => Promise<T>): Promise<ActionResult<T>> {
  return actionRun(name, () => run(), {});
}

async function actionRun<T>(
  name: string,
  run: (route: string) => Promise<T>,
  opts: { message?: (data: T) => string },
): Promise<ActionResult<T>> {
  const route = `/interno/azioni/${name}`;
  const ctx = { ...(await requestContext(route)), method: "POST" };
  const support_code = supportCodeFromRequestId(ctx.request_id);
  const started = performance.now();
  const duration = () => Math.round(performance.now() - started);
  return runWithContext(ctx, async () => {
    await refreshDiagnosticModes();
    log.event("http.request.start", {
      method: "POST",
      route,
      platform: PLATFORM,
      app_version: "n/d",
      ip_hash: ctx.ip_hash,
    });
    try {
      const data = await run(route);
      log.event("http.request.end", {
        method: "POST",
        route,
        status: 200,
        duration_ms: duration(),
        error_code: null,
        error_message: null,
        support_code,
      });
      return { ok: true as const, data, ...(opts.message && { message: opts.message(data) }) };
    } catch (e) {
      unstable_rethrow(e);
      const { error, unexpected } = classifyError(e);
      const common = { method: "POST", route, status: error.status, duration_ms: duration(), support_code };
      if (unexpected) {
        log.event(
          "http.request.failed",
          { ...common, error_code: error.code, error_message: error.message },
          { error: error.cause ?? error },
        );
      } else {
        log.event(
          "http.request.end",
          { ...common, error_code: error.code, error_message: error.message },
          { level: error.logged ? "info" : "warn" },
        );
      }
      return { ok: false as const, code: error.code, message: error.userMessage, supportCode: support_code };
    } finally {
      flushAfter();
    }
  });
}
