import { z } from "zod";
import { enroll } from "@/lib/loyalty";
import { parseJsonBody } from "@/lib/observability/validation";
import { withApi } from "@/lib/observability/with-api";

export const runtime = "nodejs";

const Body = z.object({
  shopSlug: z.string().min(3).max(40),
  name: z.string().trim().min(2).max(80),
  // formato E.164 semplificato: +39 opzionale, solo cifre
  phone: z
    .string()
    .transform((s) => s.replace(/[\s.-]/g, ""))
    .pipe(z.string().regex(/^\+?\d{8,15}$/, "Telefono non valido")),
  consentPrivacy: z.literal(true, { error: "Consenso privacy obbligatorio" }),
  consentMarketing: z.boolean().default(false),
});

export const POST = withApi(async (req) => {
  const body = await parseJsonBody(req, Body);
  return Response.json(await enroll(body));
});
