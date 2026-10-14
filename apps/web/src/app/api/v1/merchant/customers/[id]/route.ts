import { merchantRoute, preflight } from "@/lib/api/merchant";
import { deleteCustomer } from "@/lib/loyalty";
import { customerDetail } from "@/lib/merchant/customers";

export const runtime = "nodejs";

export const GET = merchantRoute("customer", async ({ shop, params }) => customerDetail(shop, params.id));

export const DELETE = merchantRoute("deleteCustomer", async ({ shop, staff, params, body }) =>
  deleteCustomer(shop.id, params.id, { type: "staff", userId: staff.userId }, body.reason),
);
export const OPTIONS = preflight;
