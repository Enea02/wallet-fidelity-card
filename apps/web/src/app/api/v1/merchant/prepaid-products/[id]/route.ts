import { merchantRoute, preflight } from "@/lib/api/merchant";
import { updateProduct } from "@/lib/prepaid";

export const runtime = "nodejs";

export const PATCH = merchantRoute("updatePrepaidProduct", async ({ shop, staff, params, body }) => ({
  product: await updateProduct(shop, params.id, body, staff.userId),
}));
export const OPTIONS = preflight;
