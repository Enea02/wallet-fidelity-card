import { merchantRoute, preflight } from "@/lib/api/merchant";
import { adjustBalance } from "@/lib/loyalty";

export const runtime = "nodejs";

export const POST = merchantRoute("adjust", async ({ shop, staff, params, body }) => ({
  card: (await adjustBalance(shop.id, params.id, body, staff.userId)).customer,
}));
export const OPTIONS = preflight;
