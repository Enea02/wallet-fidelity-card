import { EnrollVerifyBody } from "@loyalty/shared/api";
import { enforceRateLimit } from "@/lib/api/rate-limit";
import { getContext } from "@/lib/observability/context";
import { parseJsonBody } from "@/lib/observability/validation";
import { withApi } from "@/lib/observability/with-api";
import { verifyEnrollment } from "@/lib/public/enrollment";

export const runtime = "nodejs";

/** Iscrizione, passo 2: codice dell'SMS → carta creata o ritrovata. */
export const POST = withApi(async (req) => {
  await enforceRateLimit("IP", getContext()?.ip_hash ?? "sconosciuto", "/api/public/enroll/verify");
  const { enrollmentId, code } = await parseJsonBody(req, EnrollVerifyBody);
  return Response.json(await verifyEnrollment(enrollmentId, code));
});
