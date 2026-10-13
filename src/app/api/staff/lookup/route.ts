import { z } from "zod";
import { getCustomerByQr, getShopById, publicView } from "@/lib/loyalty";
import { errorResponse, HttpError, requireStaff } from "@/lib/auth";

export const runtime = "nodejs";

const Body = z.object({ shopId: z.uuid(), qrToken: z.string().regex(/^[0-9a-f]{32}$/) });

/** Mostra la carta allo staff prima di timbrare o riscattare. */
export async function POST(req: Request) {
  try {
    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) throw new HttpError(400, "QR non valido");
    await requireStaff(req, parsed.data.shopId);
    const [customer, shop] = await Promise.all([
      getCustomerByQr(parsed.data.shopId, parsed.data.qrToken),
      getShopById(parsed.data.shopId),
    ]);
    return Response.json({ customer: publicView(customer, shop) });
  } catch (e) {
    return errorResponse(e);
  }
}
