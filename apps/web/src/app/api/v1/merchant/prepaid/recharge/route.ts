import { merchantRoute, preflight } from "@/lib/api/merchant";
import { rechargePrepaid } from "@/lib/prepaid";

export const runtime = "nodejs";

export const POST = merchantRoute("prepaidRecharge", async ({ shop, staff, body, idempotencyKey }) =>
  rechargePrepaid(shop, body.cardId, staff.userId, { idempotencyKey }),
);
export const OPTIONS = preflight;
