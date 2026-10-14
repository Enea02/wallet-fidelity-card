import { docsEnabled } from "@/lib/api/openapi";

export const runtime = "nodejs";

/** Documentazione navigabile delle API esercente (solo in sviluppo), con Scalar. */
export function GET() {
  if (!docsEnabled()) return new Response(null, { status: 404 });
  const html = `<!doctype html>
<html lang="it">
<head><meta charset="utf-8"><title>API esercente</title><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body>
<script id="api-reference" data-url="/api/v1/docs/openapi.json"></script>
<script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.25.0"></script>
</body>
</html>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}
