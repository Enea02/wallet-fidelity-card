import { merchantRoute, preflight } from "@/lib/api/merchant";
import { adjustPrepaid } from "@/lib/prepaid";

export const runtime = "nodejs";

export const POST = merchantRoute("prepaidAdjust", async ({ shop, staff, params, body }) =>
  adjustPrepaid(shop, params.id, body.balance, body.reason, staff.userId),
);
export const OPTIONS = preflight;
