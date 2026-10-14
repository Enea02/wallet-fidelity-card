import { z } from "zod";
import { requireStaff } from "@/lib/auth";
import { redeem } from "@/lib/loyalty";
import { parseJsonBody } from "@/lib/observability/validation";
import { withApi } from "@/lib/observability/with-api";

export const runtime = "nodejs";

const Body = z.object({ shopId: z.uuid(), qrToken: z.string().regex(/^[0-9a-f]{32}$/, "QR non valido") });

export const POST = withApi(async (req) => {
  const { shopId, qrToken } = await parseJsonBody(req, Body);
  const staffId = await requireStaff(req, shopId);
  return Response.json(await redeem(shopId, qrToken, staffId));
});
