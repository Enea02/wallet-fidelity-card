import { merchantRoute, preflight } from "@/lib/api/merchant";
import { addPoints } from "@/lib/points";

export const runtime = "nodejs";

export const POST = merchantRoute("pointsAdd", async ({ shop, staff, body, idempotencyKey }) =>
  addPoints(shop, body.customerId, body.amountCents, staff.userId, { idempotencyKey }),
);
export const OPTIONS = preflight;
