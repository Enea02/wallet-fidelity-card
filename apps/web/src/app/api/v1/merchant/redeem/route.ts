import { merchantRoute, preflight } from "@/lib/api/merchant";
import { redeem } from "@/lib/loyalty";

export const runtime = "nodejs";

export const POST = merchantRoute("redeem", async ({ shop, staff, body, idempotencyKey }) => ({
  card: (await redeem(shop.id, body.customerId, staff.userId, { idempotencyKey })).customer,
}));
export const OPTIONS = preflight;
