import { UnsubscribeBody } from "@loyalty/shared/api";
import { enforceRateLimit } from "@/lib/api/rate-limit";
import { getContext } from "@/lib/observability/context";
import { parseJsonBody } from "@/lib/observability/validation";
import { withApi } from "@/lib/observability/with-api";
import { unsubscribeWithToken } from "@/lib/public/unsubscribe";

export const runtime = "nodejs";

/** Disiscrizione dalle promozioni (link firmato e monouso, conferma con pulsante). */
export const POST = withApi(async (req) => {
  await enforceRateLimit("IP", getContext()?.ip_hash ?? "sconosciuto", "/api/public/unsubscribe");
  const { token } = await parseJsonBody(req, UnsubscribeBody);
  return Response.json(await unsubscribeWithToken(token));
});
