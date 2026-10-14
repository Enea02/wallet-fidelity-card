import { EnrollStartBody } from "@loyalty/shared/api";
import { enforceRateLimit } from "@/lib/api/rate-limit";
import { getContext } from "@/lib/observability/context";
import { parseJsonBody } from "@/lib/observability/validation";
import { withApi } from "@/lib/observability/with-api";
import { startEnrollment } from "@/lib/public/enrollment";

export const runtime = "nodejs";

/** Iscrizione, passo 1: form + anti-bot + limiti, poi SMS con il codice. */
export const POST = withApi(async (req) => {
  await enforceRateLimit("IP", getContext()?.ip_hash ?? "sconosciuto", "/api/public/enroll/start");
  return Response.json(await startEnrollment(await parseJsonBody(req, EnrollStartBody)));
});
