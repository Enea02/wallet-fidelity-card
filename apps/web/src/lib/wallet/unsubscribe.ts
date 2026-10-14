import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { requireEnv } from "../env";

/*
 * Link di disiscrizione dalle promozioni: APP_BASE_URL/u/<token>, firmato con HMAC-SHA256
 * (UNSUBSCRIBE_SECRET). Il token contiene solo id interni, mai dati personali.
 * La pagina /u/<token> e il controllo "monouso" arrivano in Fase 5.
 */

interface UnsubscribePayload {
  /** id della carta */
  c: string;
  /** id della promozione da cui arriva il link */
  p: string;
}

const sign = (data: string) => createHmac("sha256", requireEnv("UNSUBSCRIBE_SECRET")).update(data).digest("base64url");

export function unsubscribeToken(customerId: string, promotionId: string): string {
  const data = Buffer.from(JSON.stringify({ c: customerId, p: promotionId } satisfies UnsubscribePayload)).toString(
    "base64url",
  );
  return `${data}.${sign(data)}`;
}

/** Payload del token se la firma è valida, altrimenti null. */
export function verifyUnsubscribeToken(token: string): { customerId: string; promotionId: string } | null {
  const [data, sig] = token.split(".");
  if (!data || !sig) return null;
  const expected = Buffer.from(sign(data));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const p = JSON.parse(Buffer.from(data, "base64url").toString("utf8")) as Partial<UnsubscribePayload>;
    return typeof p.c === "string" && typeof p.p === "string" ? { customerId: p.c, promotionId: p.p } : null;
  } catch {
    return null;
  }
}

export const unsubscribeUrl = (customerId: string, promotionId: string) =>
  `${requireEnv("APP_BASE_URL").replace(/\/$/, "")}/u/${unsubscribeToken(customerId, promotionId)}`;
