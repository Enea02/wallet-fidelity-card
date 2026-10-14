import { merchantRoute, preflight } from "@/lib/api/merchant";
import { me } from "@/lib/merchant/me";

export const runtime = "nodejs";

export const GET = merchantRoute("me", async ({ user }) => me(user));
export const OPTIONS = preflight;
