import { AppError } from "@loyalty/shared/errors";
import { withApi } from "@/lib/observability/with-api";
import { exportCustomer } from "@/lib/support/gdpr";
import { requireSupport } from "@/lib/support/session";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Esportazione GDPR: file JSON scaricato dal pannello (solo team con 2FA, motivo obbligatorio). */
export const POST = withApi(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const user = await requireSupport("/interno/clienti/esporta");
  if (!UUID_RE.test(id)) throw new AppError("E_CARD_NOT_FOUND", `id cliente non valido: ${id}`);
  const body = (await req.json().catch(() => ({}))) as { reason?: unknown };
  const { body: json, filename } = await exportCustomer(id, typeof body.reason === "string" ? body.reason : "", user);
  return new Response(json, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
});
