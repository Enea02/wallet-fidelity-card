import { staffShops } from "@/lib/auth";
import { withApi } from "@/lib/observability/with-api";

export const runtime = "nodejs";

/** Negozi su cui l'utente loggato può timbrare. */
export const GET = withApi(async (req) => Response.json({ shops: await staffShops(req) }));
