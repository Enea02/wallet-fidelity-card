import { merchantRoute, preflight } from "@/lib/api/merchant";
import { addStamp } from "@/lib/loyalty";

export const runtime = "nodejs";

export const POST = merchantRoute("stamp", async ({ shop, staff, body, idempotencyKey }) => {
  const r = await addStamp(shop.id, body.customerId, staff.userId, { idempotencyKey, force: body.force === true });
  return { card: r.customer, rewardUnlocked: r.rewardUnlocked, forced: r.forced };
});
export const OPTIONS = preflight;
