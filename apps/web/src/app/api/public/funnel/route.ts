import { FunnelBody } from "@loyalty/shared/api";
import { parseJsonBody } from "@/lib/observability/validation";
import { withApi } from "@/lib/observability/with-api";
import { recordFunnelStep } from "@/lib/public/enrollment";

export const runtime = "nodejs";

/** Passi del funnel che avvengono nel browser: pulsante Wallet mostrato e cliccato. */
export const POST = withApi(async (req) => {
  const { enrollmentId, step, wallet } = await parseJsonBody(req, FunnelBody);
  await recordFunnelStep(enrollmentId, step, wallet);
  return Response.json({ ok: true });
});
