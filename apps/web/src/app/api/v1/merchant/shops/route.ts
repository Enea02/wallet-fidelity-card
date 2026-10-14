import { merchantRoute, preflight } from "@/lib/api/merchant";
import { myShops } from "@/lib/merchant/me";

export const runtime = "nodejs";

export const GET = merchantRoute("shops", async ({ user }) => myShops(user));
export const OPTIONS = preflight;
