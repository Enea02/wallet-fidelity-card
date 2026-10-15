import { merchantRoute, preflight } from "@/lib/api/merchant";
import { undoLastStamp } from "@/lib/loyalty";

export const runtime = "nodejs";

export const POST = merchantRoute("undo", async ({ shop, staff, body, idempotencyKey }) => ({
  card: (await undoLastStamp(shop.id, body.customerId, staff.userId, { idempotencyKey })).customer,
}));
export const OPTIONS = preflight;
