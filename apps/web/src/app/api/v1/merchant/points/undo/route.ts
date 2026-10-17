import { merchantRoute, preflight } from "@/lib/api/merchant";
import { undoPoints } from "@/lib/points";

export const runtime = "nodejs";

export const POST = merchantRoute("pointsUndo", async ({ shop, staff, body, idempotencyKey }) =>
  undoPoints(shop, body.customerId, staff.userId, { idempotencyKey }),
);
export const OPTIONS = preflight;
