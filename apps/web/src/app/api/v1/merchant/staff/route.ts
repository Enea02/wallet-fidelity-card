import { merchantRoute, preflight } from "@/lib/api/merchant";
import { listStaff } from "@/lib/merchant/staff";

export const runtime = "nodejs";

export const GET = merchantRoute("staff", async ({ shop }) => listStaff(shop));
export const OPTIONS = preflight;
