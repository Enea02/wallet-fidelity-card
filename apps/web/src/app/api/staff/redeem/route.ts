import { z } from "zod";
import { redeem } from "@/lib/loyalty";
import { errorResponse, HttpError, requireStaff } from "@/lib/auth";

export const runtime = "nodejs";

const Body = z.object({ shopId: z.uuid(), qrToken: z.string().regex(/^[0-9a-f]{32}$/) });

export async function POST(req: Request) {
  try {
    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) throw new HttpError(400, "QR non valido");
    const staffId = await requireStaff(req, parsed.data.shopId);
    return Response.json(await redeem(parsed.data.shopId, parsed.data.qrToken, staffId));
  } catch (e) {
    return errorResponse(e);
  }
}
