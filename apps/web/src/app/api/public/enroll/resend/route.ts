import { EnrollmentIdBody } from "@loyalty/shared/api";
import { enforceRateLimit } from "@/lib/api/rate-limit";
import { getContext } from "@/lib/observability/context";
import { parseJsonBody } from "@/lib/observability/validation";
import { withApi } from "@/lib/observability/with-api";
import { resendOtp } from "@/lib/public/enrollment";

export const runtime = "nodejs";

/** Nuovo codice (dopo 60 secondi, con gli stessi limiti per numero e IP). */
export const POST = withApi(async (req) => {
  await enforceRateLimit("IP", getContext()?.ip_hash ?? "sconosciuto", "/api/public/enroll/resend");
  const { enrollmentId } = await parseJsonBody(req, EnrollmentIdBody);
  return Response.json(await resendOtp(enrollmentId));
});
