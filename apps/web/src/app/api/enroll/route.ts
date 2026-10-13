import { z } from "zod";
import { enroll } from "@/lib/loyalty";
import { errorResponse, HttpError } from "@/lib/auth";

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

export async function POST(req: Request) {
  try {
    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "Dati non validi");
    const result = await enroll(parsed.data);
    return Response.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}
