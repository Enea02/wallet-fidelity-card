import { merchantRoute, preflight } from "@/lib/api/merchant";
import { listCustomers } from "@/lib/merchant/customers";

export const runtime = "nodejs";

export const GET = merchantRoute("customers", async ({ shop, query, actor }) => listCustomers(shop, query, actor));
export const OPTIONS = preflight;
