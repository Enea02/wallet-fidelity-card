import { merchantRoute, preflight } from "@/lib/api/merchant";
import { getSettings, updateSettings } from "@/lib/merchant/settings";

export const runtime = "nodejs";

export const GET = merchantRoute("settings", async ({ shop }) => getSettings(shop));
export const PUT = merchantRoute("updateSettings", async ({ shop, staff, body, actor }) =>
  updateSettings(shop, body, staff.userId, actor),
);
export const OPTIONS = preflight;
