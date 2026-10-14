import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { AppError } from "@loyalty/shared/errors";
import { requireEnv } from "@/lib/env";
import { getShopBySlug } from "@/lib/loyalty";
import { setContext } from "@/lib/observability/context";
import { parseJsonBody } from "@/lib/observability/validation";
import { withApi } from "@/lib/observability/with-api";
import { classIdFor, googleEnabled } from "@/lib/wallet/google/config";
import { syncClass } from "@/lib/wallet/sync";

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
 * Crea/aggiorna subito la LoyaltyClass Google di un negozio (di norma lo fa da sé il salvataggio
 * delle impostazioni). Esito nei log: wallet.google.class.upsert.ok / failed.
 */
export const POST = withApi(async (req) => {
  checkAdmin(req);
  const { shopSlug } = await parseJsonBody(req, Body);
  const shop = await getShopBySlug(shopSlug);
  if (!shop) throw new AppError("E_SHOP_NOT_FOUND", `nessun negozio con slug "${shopSlug}"`);
  setContext({ shop_id: shop.id });
  if (!googleEnabled()) return Response.json({ classId: null, synced: false });
  return Response.json({ classId: classIdFor(shop.slug), synced: await syncClass(shop) });
});
