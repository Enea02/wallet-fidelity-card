import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { requireEnv } from "../env";

/*
 * Link breve firmato per aprire la carta dal telefono (QR mostrato sul computer):
 * APP_BASE_URL/<slug>/c/<token>, valido 24 ore. Contiene solo l'id della carta (nessun dato personale),
 * firmato con PUBLIC_LINK_SECRET.
 */

const TTL_S = 24 * 3600;
const sign = (data: string) => createHmac("sha256", requireEnv("PUBLIC_LINK_SECRET")).update(data).digest("base64url");

export function phoneLinkToken(customerId: string, now = Date.now()): string {
  const data = Buffer.from(JSON.stringify({ c: customerId, e: Math.floor(now / 1000) + TTL_S })).toString("base64url");
  return `${data}.${sign(data)}`;
}

export function verifyPhoneLinkToken(token: string, now = Date.now()): string | null {
  const [data, sig] = token.split(".");
  if (!data || !sig) return null;
  const expected = Buffer.from(sign(data));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const p = JSON.parse(Buffer.from(data, "base64url").toString("utf8")) as { c?: unknown; e?: unknown };
    if (typeof p.c !== "string" || typeof p.e !== "number" || p.e * 1000 < now) return null;
    return p.c;
  } catch {
    return null;
  }
}

export const phoneLink = (slug: string, customerId: string) =>
  `${requireEnv("APP_BASE_URL").replace(/\/$/, "")}/${slug}/c/${phoneLinkToken(customerId)}`;

/** Impronta del telefono per i limiti OTP e per la ricerca dell'assistenza (mai il numero in chiaro). */
export const phoneHash = (e164: string) =>
  createHmac("sha256", requireEnv("IP_HASH_SALT")).update(`tel:${e164}`).digest("hex").slice(0, 32);
