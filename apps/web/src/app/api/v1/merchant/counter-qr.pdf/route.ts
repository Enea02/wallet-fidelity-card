import { merchantRoute, preflight } from "@/lib/api/merchant";
import { counterQrPdf } from "@/lib/merchant/counter-qr";
import { getProduct } from "@/lib/prepaid";

export const runtime = "nodejs";

/** Cartello A5: della carta fedeltà, o di una tessera prepagata con ?product=<id> (Fase 9.5). */
export const GET = merchantRoute("counterQr", async ({ shop, actor, query }) =>
  counterQrPdf(shop, actor, query.product ? await getProduct(shop.id, query.product) : null),
);
export const OPTIONS = preflight;
