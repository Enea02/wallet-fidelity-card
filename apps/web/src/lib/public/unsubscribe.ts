import "server-only";
import { createHash } from "node:crypto";
import { AppError } from "@loyalty/shared/errors";
import { fromDbError } from "../db-errors";
import { domainMeta } from "../merchant/domain-call";
import { setContext } from "../observability/context";
import { log } from "../observability/logger";
import { supabaseAdmin } from "../supabase";
import { verifyUnsubscribeToken } from "../wallet/unsubscribe";

/*
 * Disiscrizione dalle promozioni dal link nel messaggio: firmato (UNSUBSCRIBE_SECRET) e monouso.
 * La pagina chiede conferma con un pulsante (POST): le anteprime dei link nelle chat non disiscrivono nessuno.
 */

const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");

interface LinkInfo {
  customerId: string;
  promotionId: string;
  shopName: string;
  shortCode: string;
  alreadyUsed: boolean;
}

/** Controlla il link senza usarlo (per mostrare la pagina di conferma). */
export async function inspectUnsubscribeLink(token: string): Promise<LinkInfo> {
  const p = verifyUnsubscribeToken(token);
  if (!p) throw new AppError("E_LINK_INVALID", "link di disiscrizione con firma non valida");
  const db = supabaseAdmin();
  const { data: c } = await db
    .from("customers")
    .select("short_code, shop_id, deleted_at")
    .eq("id", p.customerId)
    .maybeSingle();
  if (!c || c.deleted_at)
    throw new AppError("E_LINK_INVALID", "link di disiscrizione di una carta inesistente o cancellata");
  const [{ data: shop }, { data: used }] = await Promise.all([
    db.from("shops").select("name").eq("id", c.shop_id).single(),
    db.from("unsubscribe_tokens_used").select("token_hash").eq("token_hash", tokenHash(token)).maybeSingle(),
  ]);
  setContext({ shop_id: c.shop_id as string, customer_ref: c.short_code as string });
  return {
    customerId: p.customerId,
    promotionId: p.promotionId,
    shopName: (shop?.name as string) ?? "",
    shortCode: c.short_code as string,
    alreadyUsed: used !== null,
  };
}

export async function unsubscribeWithToken(token: string) {
  const info = await inspectUnsubscribeLink(token);
  const { data, error } = await supabaseAdmin().rpc("unsubscribe_with_token", {
    p_token_hash: tokenHash(token),
    p_customer_id: info.customerId,
    p_promotion_id: /^[0-9a-f-]{36}$/.test(info.promotionId) ? info.promotionId : null,
    p_meta: domainMeta({ type: "customer", customerId: info.customerId }),
  });
  if (error) {
    const e = fromDbError(error);
    if (e instanceof AppError && e.code === "E_CARD_DELETED")
      throw new AppError("E_LINK_INVALID", "carta cancellata", {}, { cause: e });
    throw e;
  }
  const already = (data as { already_used: boolean }).already_used;
  log.event("marketing.unsubscribe.ok", {
    customer_ref: info.shortCode,
    shop_name: info.shopName,
    already_unsubscribed: already,
  });
  return { status: already ? ("already" as const) : ("done" as const), shopName: info.shopName };
}
