import { merchantRoute, preflight } from "@/lib/api/merchant";
import { saveDiagnostics } from "@/lib/merchant/diagnostics";

export const runtime = "nodejs";

export const POST = merchantRoute("diagnostics", async ({ shop, staff, body, actor }) =>
  saveDiagnostics(shop, body, staff.userId, actor),
);
export const OPTIONS = preflight;
