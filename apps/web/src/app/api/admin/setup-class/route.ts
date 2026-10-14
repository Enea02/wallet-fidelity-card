import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { AppError } from "@loyalty/shared/errors";
import { requireEnv } from "@/lib/env";
import { getShopBySlug } from "@/lib/loyalty";
import { setContext } from "@/lib/observability/context";
import { parseJsonBody } from "@/lib/observability/validation";
import { withApi } from "@/lib/observability/with-api";
import { upsertLoyaltyClass } from "@/lib/wallet/google";

export const runtime = "nodejs";

const Body = z.object({ shopSlug: z.string().min(3).max(40) });

function checkAdmin(req: Request) {
  const given = Buffer.from(req.headers.get("x-admin-token") ?? "");
  const expected = Buffer.from(requireEnv("ADMIN_SETUP_TOKEN"));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    throw new AppError("E_ADMIN_UNAUTHORIZED", "x-admin-token assente o diverso da ADMIN_SETUP_TOKEN");
  }
  setContext({ role: "admin" });
}

/**
 * Crea/aggiorna la LoyaltyClass Google di un negozio.
 * Da chiamare una volta per negozio e dopo ogni cambio di nome/logo/colore:
 *   curl -X POST $APP_BASE_URL/api/admin/setup-class \
 *     -H "x-admin-token: $ADMIN_SETUP_TOKEN" -H "content-type: application/json" \
 *     -d '{"shopSlug":"salone-mario"}'
 */
export const POST = withApi(async (req) => {
  checkAdmin(req);
  const { shopSlug } = await parseJsonBody(req, Body);
  const shop = await getShopBySlug(shopSlug);
  if (!shop) throw new AppError("E_SHOP_NOT_FOUND", `nessun negozio con slug "${shopSlug}"`);
  setContext({ shop_id: shop.id });
  const classId = await upsertLoyaltyClass(shop);
  return Response.json({ classId });
});
