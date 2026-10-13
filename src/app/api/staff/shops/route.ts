import { errorResponse, staffShops } from "@/lib/auth";

export const runtime = "nodejs";

/** Negozi su cui l'utente loggato può timbrare. */
export async function GET(req: Request) {
  try {
    return Response.json({ shops: await staffShops(req) });
  } catch (e) {
    return errorResponse(e);
  }
}
