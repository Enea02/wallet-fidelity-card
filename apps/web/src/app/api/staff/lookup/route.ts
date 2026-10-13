import { z } from "zod";
import { requireStaff } from "@/lib/auth";
import { getCustomerByQr, getShopById, publicView } from "@/lib/loyalty";
import { parseJsonBody } from "@/lib/observability/validation";
import { withApi } from "@/lib/observability/with-api";

export const runtime = "nodejs";

const Body = z.object({ shopId: z.uuid(), qrToken: z.string().regex(/^[0-9a-f]{32}$/, "QR non valido") });

/** Mostra la carta allo staff prima di timbrare o riscattare. */
export const POST = withApi(async (req) => {
  const { shopId, qrToken } = await parseJsonBody(req, Body);
  await requireStaff(req, shopId);
  const [customer, shop] = await Promise.all([getCustomerByQr(shopId, qrToken), getShopById(shopId)]);
  return Response.json({ customer: publicView(customer, shop) });
});
