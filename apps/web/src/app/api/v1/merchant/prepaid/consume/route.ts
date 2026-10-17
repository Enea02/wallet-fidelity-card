import { merchantRoute, preflight } from "@/lib/api/merchant";
import { consumePrepaid } from "@/lib/prepaid";

export const runtime = "nodejs";

export const POST = merchantRoute("prepaidConsume", async ({ shop, staff, body, idempotencyKey }) =>
  consumePrepaid(shop, body.cardId, body.quantity, staff.userId, { idempotencyKey }),
);
export const OPTIONS = preflight;
