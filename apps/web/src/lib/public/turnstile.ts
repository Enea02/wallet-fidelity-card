import "server-only";
import { optionalEnv, requireEnv } from "../env";
import { fetchExternal } from "../observability/fetch-external";

/*
 * Cloudflare Turnstile: verifica lato server del token anti-bot prima di ogni primo SMS.
 * In sviluppo e test si usano le chiavi di prova pubbliche di Cloudflare (sempre valide).
 */

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export type CaptchaResult = { ok: true } | { ok: false; reason: string };

export async function verifyCaptcha(token: string): Promise<CaptchaResult> {
  const res = await fetchExternal({
    provider: "cloudflare-turnstile",
    operation: "verifica anti-bot",
    url: optionalEnv("TURNSTILE_VERIFY_URL") ?? VERIFY_URL,
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ secret: requireEnv("TURNSTILE_SECRET_KEY"), response: token }).toString(),
    timeoutMs: 8000,
  });
  const json = (await res.json()) as { success?: boolean; "error-codes"?: string[] };
  return json.success ? { ok: true } : { ok: false, reason: (json["error-codes"] ?? []).join(", ") || "rifiutato" };
}
