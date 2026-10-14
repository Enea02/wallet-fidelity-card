import { merchantRoute, preflight } from "@/lib/api/merchant";
import { lookupCard } from "@/lib/loyalty";

export const runtime = "nodejs";

export const POST = merchantRoute("lookup", async ({ shop, body, actor }) => lookupCard(shop, body.code, actor));
export const OPTIONS = preflight;
