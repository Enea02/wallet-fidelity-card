import { merchantRoute, preflight } from "@/lib/api/merchant";
import { shopStats } from "@/lib/merchant/stats";

export const runtime = "nodejs";

export const GET = merchantRoute("stats", async ({ shop, actor }) => shopStats(shop, actor));
export const OPTIONS = preflight;
