import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { getShopBySlug } from "@/lib/loyalty";
import { errorResponse, HttpError } from "@/lib/auth";
import { requireEnv } from "@/lib/env";
import { upsertLoyaltyClass } from "@/lib/wallet/google";

export const runtime = "nodejs";

const Body = z.object({ shopSlug: z.string().min(3).max(40) });

function checkAdmin(req: Request) {
  const given = Buffer.from(req.headers.get("x-admin-token") ?? "");
  const expected = Buffer.from(requireEnv("ADMIN_SETUP_TOKEN"));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    throw new HttpError(401, "Non autorizzato");
  }
}

/**
 * Crea/aggiorna la LoyaltyClass Google di un negozio.
 * Da chiamare una volta per negozio e dopo ogni cambio di nome/logo/colore:
 *   curl -X POST $APP_BASE_URL/api/admin/setup-class \
 *     -H "x-admin-token: $ADMIN_SETUP_TOKEN" -H "content-type: application/json" \
 *     -d '{"shopSlug":"salone-mario"}'
 */
export async function POST(req: Request) {
  try {
    checkAdmin(req);
    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) throw new HttpError(400, "shopSlug mancante");
    const shop = await getShopBySlug(parsed.data.shopSlug);
    if (!shop) throw new HttpError(404, "Negozio non trovato");
    const classId = await upsertLoyaltyClass(shop);
    return Response.json({ classId });
  } catch (e) {
    return errorResponse(e);
  }
}
