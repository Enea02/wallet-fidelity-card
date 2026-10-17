import { merchantRoute, preflight } from "@/lib/api/merchant";
import { createProduct, listProducts } from "@/lib/prepaid";

export const runtime = "nodejs";

export const GET = merchantRoute("prepaidProducts", async ({ shop }) => ({ products: await listProducts(shop) }));
export const POST = merchantRoute("createPrepaidProduct", async ({ shop, staff, body }) => ({
  product: await createProduct(shop, body, staff.userId),
}));
export const OPTIONS = preflight;
