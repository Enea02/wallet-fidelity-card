import { merchantRoute, preflight } from "@/lib/api/merchant";
import { activatePrepaid } from "@/lib/prepaid";

export const runtime = "nodejs";

export const POST = merchantRoute("prepaidActivate", async ({ shop, staff, body, idempotencyKey }) =>
  activatePrepaid(shop, body.cardId, staff.userId, { idempotencyKey }),
);
export const OPTIONS = preflight;
