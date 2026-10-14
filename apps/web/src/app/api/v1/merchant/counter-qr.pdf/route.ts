import { merchantRoute, preflight } from "@/lib/api/merchant";
import { counterQrPdf } from "@/lib/merchant/counter-qr";

export const runtime = "nodejs";

export const GET = merchantRoute("counterQr", async ({ shop, actor }) => counterQrPdf(shop, actor));
export const OPTIONS = preflight;
