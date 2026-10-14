import { merchantRoute, preflight } from "@/lib/api/merchant";
import { inviteStaff } from "@/lib/merchant/staff";

export const runtime = "nodejs";

export const POST = merchantRoute("invite", async ({ shop, staff, body, actor }) =>
  inviteStaff(shop, body, staff.userId, actor),
);
export const OPTIONS = preflight;
