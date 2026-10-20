import { merchantRoute, preflight } from "@/lib/api/merchant";
import { adjustPoints } from "@/lib/points";

export const runtime = "nodejs";

export const POST = merchantRoute("pointsAdjust", async ({ shop, staff, params, body }) =>
  adjustPoints(shop, params.id, body.points, body.reason, staff.userId),
);
export const OPTIONS = preflight;
