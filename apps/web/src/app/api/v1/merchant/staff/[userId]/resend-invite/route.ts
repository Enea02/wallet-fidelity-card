import { merchantRoute, preflight } from "@/lib/api/merchant";
import { resendInvite } from "@/lib/merchant/staff";

export const runtime = "nodejs";

export const POST = merchantRoute("resendInvite", async ({ shop, params, actor }) =>
  resendInvite(shop, params.userId, actor),
);
export const OPTIONS = preflight;
