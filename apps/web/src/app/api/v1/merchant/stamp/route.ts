import { merchantRoute, preflight } from "@/lib/api/merchant";
import { addStamp } from "@/lib/loyalty";

export const runtime = "nodejs";

export const POST = merchantRoute("stamp", async ({ shop, staff, body }) => {
  const r = await addStamp(shop.id, body.customerId, staff.userId);
  return { card: r.customer, rewardUnlocked: r.rewardUnlocked };
});
export const OPTIONS = preflight;
