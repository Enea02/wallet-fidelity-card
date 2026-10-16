import { merchantRoute, preflight } from "@/lib/api/merchant";
import { undoPrepaid } from "@/lib/prepaid";

export const runtime = "nodejs";

export const POST = merchantRoute("prepaidUndo", async ({ shop, staff, body, idempotencyKey }) =>
  undoPrepaid(shop, body.cardId, staff.userId, { idempotencyKey }),
);
export const OPTIONS = preflight;
