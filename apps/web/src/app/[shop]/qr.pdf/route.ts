import { AppError } from "@loyalty/shared/errors";
import { getShopBySlug } from "@/lib/loyalty";
import { counterQrPdf } from "@/lib/merchant/counter-qr";
import { setContext } from "@/lib/observability/context";
import { withApi } from "@/lib/observability/with-api";

export const runtime = "nodejs";

/** PDF del cartello A5 dalla pagina pubblica /<slug>/qr (è un cartello da esporre: nessun login). */
export const GET = withApi(async (_req: Request, ctx: { params: Promise<{ shop: string }> }) => {
  const { shop: slug } = await ctx.params;
  const shop = await getShopBySlug(slug);
  if (!shop || shop.status !== "active")
    throw new AppError("E_SHOP_NOT_FOUND", `nessun negozio attivo con slug "${slug}"`);
  setContext({ shop_id: shop.id });
  return counterQrPdf(shop, null);
});
