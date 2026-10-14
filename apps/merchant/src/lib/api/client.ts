import { ErrorBody, HEADERS, merchantApi, type MerchantEndpoint } from "@loyalty/shared/api";
import { errors, type ErrorCode } from "@loyalty/shared/errors";
import type { AppApiErrorFields } from "@loyalty/shared/logging/events";
import { newRequestId, supportCodeFromRequestId } from "@loyalty/shared/logging/request-id";
import type { z } from "zod";

/*
 * Client unico delle API esercente. Per ogni chiamata:
 * token, X-Request-Id (generato qui: lo stesso id finisce nel log del backend), piattaforma,
 * versione e build, X-Shop-Id; validazione della risposta con lo schema zod del registro;
 * errori convertiti in ApiError con il messaggio del catalogo e il codice assistenza.
 * Senza dipendenze da React Native: le dipendenze arrivano da createApiClient (testabile).
 */

type Def<K extends MerchantEndpoint> = (typeof merchantApi)[K];
type Infer<T> = T extends z.ZodType ? z.output<T> : never;
type Input<T> = T extends z.ZodType ? z.input<T> : never;

export type ApiResponse<K extends MerchantEndpoint> = Def<K>["response"] extends z.ZodType
  ? Infer<Def<K>["response"]>
  : Blob;

type BodyOf<K extends MerchantEndpoint> = Def<K> extends { body: infer B } ? { body: Input<B> } : { body?: never };
type ParamsOf<K extends MerchantEndpoint> =
  Def<K> extends { params: infer P } ? { params: Input<P> } : { params?: never };
type QueryOf<K extends MerchantEndpoint> = Def<K> extends { query: infer Q } ? { query?: Input<Q> } : { query?: never };
type ShopOf<K extends MerchantEndpoint> = Def<K>["auth"] extends "user" ? { shopId?: never } : { shopId: string };
/** Azioni sul saldo: chiave del tocco (useCardActions la riusa se la rete cade). */
type KeyOf<K extends MerchantEndpoint> =
  Def<K> extends { idempotent: true } ? { idempotencyKey: string } : { idempotencyKey?: never };

export type CallOptions<K extends MerchantEndpoint> = BodyOf<K> & ParamsOf<K> & QueryOf<K> & ShopOf<K> & KeyOf<K>;

export class ApiError extends Error {
  constructor(
    readonly code: ErrorCode | string,
    readonly userMessage: string,
    /** Codice da comunicare all'assistenza (ERR-XXXXX): ritrova la riga nel log del backend. */
    readonly supportCode: string,
    readonly requestId: string,
    readonly status: number | null,
    message?: string,
  ) {
    super(message ?? `${code}: ${userMessage}`);
    this.name = "ApiError";
  }
}

export interface ApiDeps {
  baseUrl: string;
  fetch: typeof fetch;
  platform: "ios" | "android" | "web";
  appVersion: string;
  build: string;
  /** Token di accesso corrente (null se non c'è sessione). */
  getAccessToken: () => Promise<string | null>;
  /** Rinnova la sessione e restituisce il nuovo token, oppure null se non si può. */
  refreshSession: () => Promise<string | null>;
  /** Rinnovo fallito: l'app chiude la sessione e torna al login. */
  onSessionExpired: () => void;
  isOnline: () => boolean;
  /** Registra app.api.error (buffer e Sentry). */
  logError: (fields: AppApiErrorFields) => void;
  timeoutMs?: number;
  newRequestId?: () => string;
  now?: () => number;
}

const catalogMessage = (code: string) =>
  code in errors ? errors[code as ErrorCode].userMessage : errors.E_INTERNAL.userMessage;

function buildPath(
  path: string,
  params: Record<string, unknown> | undefined,
  query: Record<string, unknown> | undefined,
) {
  let out = path.replace(/\{(\w+)\}/g, (_m, k: string) => {
    const v = params?.[k];
    if (v === undefined) throw new Error(`parametro ${k} mancante per ${path}`);
    return encodeURIComponent(String(v));
  });
  const qs = Object.entries(query ?? {})
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join("&");
  if (qs) out += `?${qs}`;
  return out;
}

export function createApiClient(deps: ApiDeps) {
  const now = deps.now ?? (() => Date.now());
  const makeId = deps.newRequestId ?? (() => newRequestId());
  const timeoutMs = deps.timeoutMs ?? 15_000;

  async function send(
    def: (typeof merchantApi)[MerchantEndpoint],
    url: string,
    init: RequestInit,
    token: string | null,
    requestId: string,
  ) {
    const headers: Record<string, string> = {
      accept: def.response === "pdf" ? "application/pdf" : "application/json",
      [HEADERS.requestId]: requestId,
      [HEADERS.platform]: deps.platform,
      [HEADERS.appVersion]: deps.appVersion,
      [HEADERS.appBuild]: deps.build,
      ...(init.headers as Record<string, string>),
    };
    if (token) headers.authorization = `Bearer ${token}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await deps.fetch(url, { ...init, headers, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  async function call<K extends MerchantEndpoint>(key: K, opts: CallOptions<K>): Promise<ApiResponse<K>> {
    const def = merchantApi[key];
    const o = opts as {
      body?: unknown;
      params?: Record<string, unknown>;
      query?: Record<string, unknown>;
      shopId?: string;
      idempotencyKey?: string;
    };
    const path = buildPath(def.path, o.params, o.query);
    const requestId = makeId();
    const started = now();

    const fail = (code: string, status: number | null, message?: string, supportCode?: string): never => {
      const err = new ApiError(
        code,
        message ?? catalogMessage(code),
        supportCode ?? supportCodeFromRequestId(requestId),
        requestId,
        status,
      );
      deps.logError({
        request_id: requestId,
        method: def.method,
        endpoint: def.path,
        http_status: status,
        error_code: code,
        support_code: err.supportCode,
        duration_ms: Math.round(now() - started),
      });
      throw err;
    };

    if (!deps.isOnline()) return fail("E_OFFLINE", null);

    const init: RequestInit = { method: def.method, headers: {} };
    if (o.shopId) (init.headers as Record<string, string>)[HEADERS.shopId] = o.shopId;
    if (o.idempotencyKey) (init.headers as Record<string, string>)[HEADERS.idempotencyKey] = o.idempotencyKey;
    if (o.body !== undefined) {
      (init.headers as Record<string, string>)["content-type"] = "application/json";
      init.body = JSON.stringify(o.body);
    }

    const url = `${deps.baseUrl}${path}`;
    const attempt = async (token: string | null): Promise<Response> => {
      try {
        return await send(def, url, init, token, requestId);
      } catch {
        return fail("E_NETWORK", null);
      }
    };

    let res = await attempt(await deps.getAccessToken());
    if (res.status === 401) {
      // token scaduto: un solo rinnovo, poi stessa richiesta (stesso request_id: è la stessa operazione)
      const fresh = await deps.refreshSession();
      if (!fresh) {
        deps.onSessionExpired();
        return fail("E_SESSION_EXPIRED", 401);
      }
      res = await attempt(fresh);
    }

    if (!res.ok) {
      const parsed = ErrorBody.safeParse(await res.json().catch(() => null));
      if (!parsed.success) return fail(res.status === 401 ? "E_SESSION_EXPIRED" : "E_BAD_RESPONSE", res.status);
      const { code, message, support_code } = parsed.data.error;
      if (res.status === 401) deps.onSessionExpired();
      return fail(code, res.status, message, support_code);
    }

    if (def.response === "pdf") return (await res.blob()) as ApiResponse<K>;
    const json = await res.json().catch(() => undefined);
    const out = def.response.safeParse(json);
    if (!out.success) return fail("E_BAD_RESPONSE", res.status);
    return out.data as ApiResponse<K>;
  }

  return { call };
}

export type ApiClient = ReturnType<typeof createApiClient>;
