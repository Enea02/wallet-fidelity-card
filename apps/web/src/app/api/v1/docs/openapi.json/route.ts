import { buildOpenApi, docsEnabled } from "@/lib/api/openapi";

export const runtime = "nodejs";

/** Documento OpenAPI delle API esercente (solo in sviluppo). */
export function GET() {
  if (!docsEnabled()) return new Response(null, { status: 404 });
  return Response.json(buildOpenApi());
}
