import { merchantRoute, preflight } from "@/lib/api/merchant";
import { listPromotions, queuePromotion } from "@/lib/merchant/promotions";

export const runtime = "nodejs";

export const GET = merchantRoute("promotions", async ({ shop }) => listPromotions(shop));
export const POST = merchantRoute("queuePromotion", async ({ shop, staff, body, actor }) =>
  queuePromotion(shop, body.text, staff.userId, actor),
);
export const OPTIONS = preflight;
