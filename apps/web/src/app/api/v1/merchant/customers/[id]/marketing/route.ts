import { merchantRoute, preflight } from "@/lib/api/merchant";
import { setMarketingConsent } from "@/lib/loyalty";

export const runtime = "nodejs";

export const POST = merchantRoute("marketing", async ({ shop, staff, params, body }) =>
  setMarketingConsent(shop.id, params.id, body.consent, { type: "staff", userId: staff.userId }),
);
export const OPTIONS = preflight;
