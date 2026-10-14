import { merchantRoute, preflight } from "@/lib/api/merchant";
import { logoUploadUrl } from "@/lib/merchant/settings";

export const runtime = "nodejs";

export const POST = merchantRoute("logoUploadUrl", async ({ shop, body, actor }) =>
  logoUploadUrl(shop, body.contentType, body.sizeBytes, actor),
);
export const OPTIONS = preflight;
