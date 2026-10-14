import "server-only";
import { AppError, type ErrorCode } from "@loyalty/shared/errors";
import jwt from "jsonwebtoken";
import { fetchExternal } from "../../observability/fetch-external";
import { apiBase, serviceAccount } from "./config";

/*
 * Client minimo dell'API Google Wallet. Token OAuth con il flusso "JWT bearer" del service
 * account (firmato qui con jsonwebtoken), chiamate con fetchExternal in modalità quiet:
 * l'esito lo registrano gli eventi wallet.google.* di chi chiama.
 */

const SCOPE = "https://www.googleapis.com/auth/wallet_object.issuer";
const DEFAULT_TOKEN_URI = "https://oauth2.googleapis.com/token";

let token: { value: string; expiresAt: number; email: string } | null = null;

async function accessToken(): Promise<string> {
  const sa = serviceAccount();
  if (token && token.email === sa.client_email && token.expiresAt > Date.now() + 60_000) return token.value;

  const tokenUri = sa.token_uri ?? DEFAULT_TOKEN_URI;
  const now = Math.floor(Date.now() / 1000);
  const assertion = jwt.sign(
    { iss: sa.client_email, scope: SCOPE, aud: tokenUri, iat: now, exp: now + 3600 },
    sa.private_key,
    {
      algorithm: "RS256",
    },
  );
  const res = await fetchExternal({
    provider: "google",
    operation: "token OAuth",
    url: tokenUri,
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }).toString(),
    quiet: true,
  });
  const json = (await res.json()) as { access_token: string; expires_in: number };
  token = { value: json.access_token, expiresAt: Date.now() + json.expires_in * 1000, email: sa.client_email };
  return token.value;
}

/** Solo per i test: dimentica il token in cache. */
export function resetGoogleToken(): void {
  token = null;
}

/** Errore di Google già classificato nel catalogo. */
export interface GoogleFailure {
  code: ErrorCode;
  httpStatus: number | null;
  providerResponse: string;
  durationMs: number;
}

/** Errore di una chiamata Google → codice del catalogo (401/403 auth, 404, 429, 400, 5xx/rete). */
export function classifyGoogleError(e: unknown): GoogleFailure {
  if (!(e instanceof AppError)) throw e;
  const status = typeof e.context.http_status === "number" ? e.context.http_status : null;
  const providerResponse = String(e.context.provider_response ?? e.message);
  const durationMs = Number(e.context.duration_ms ?? 0);
  const fromToken = String(e.message).includes("token OAuth");
  const code: ErrorCode =
    status === 401 || status === 403 || (fromToken && status !== null && status < 500)
      ? "E_GOOGLE_AUTH"
      : status === 404
        ? "E_GOOGLE_NOT_FOUND"
        : status === 429
          ? "E_GOOGLE_QUOTA"
          : status === 400
            ? "E_GOOGLE_INVALID_PAYLOAD"
            : "E_GOOGLE_UNAVAILABLE";
  return { code, httpStatus: status, providerResponse, durationMs };
}

export interface GoogleCall {
  operation: string;
  method: "GET" | "POST" | "PATCH" | "PUT";
  path: string;
  body?: unknown;
  objectId?: string;
  attempt?: number;
}

/** Chiamata all'API Wallet. Lancia AppError (E_EXTERNAL_*) da classificare con classifyGoogleError. */
export async function googleRequest<T = unknown>(c: GoogleCall): Promise<{ data: T; durationMs: number }> {
  const started = performance.now();
  const res = await fetchExternal({
    provider: "google",
    operation: c.operation,
    url: `${apiBase()}${c.path}`,
    method: c.method,
    headers: { authorization: `Bearer ${await accessToken()}` },
    ...(c.body !== undefined && { body: c.body }),
    ...(c.objectId !== undefined && { objectId: c.objectId }),
    attempt: c.attempt ?? 1,
    quiet: true,
  });
  const text = await res.text();
  return { data: (text ? JSON.parse(text) : {}) as T, durationMs: Math.round(performance.now() - started) };
}
