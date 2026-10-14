import { merchantRoute, preflight } from "@/lib/api/merchant";
import { removeStaff, updateStaff } from "@/lib/merchant/staff";

export const runtime = "nodejs";

export const PATCH = merchantRoute("updateStaff", async ({ shop, staff, params, body, actor }) =>
  updateStaff(shop, params.userId, body, staff.userId, actor),
);
export const DELETE = merchantRoute("removeStaff", async ({ shop, staff, params, actor }) =>
  removeStaff(shop, params.userId, staff.userId, actor),
);
export const OPTIONS = preflight;
