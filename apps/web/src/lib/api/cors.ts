import { AppError } from "@loyalty/shared/errors";
import { HEADERS } from "@loyalty/shared/api";

/**
 * CORS delle API esercente: solo le origini della web app esercente (MERCHANT_APP_ORIGINS,
 * separate da virgola). Le richieste senza Origin (app iOS/Android, script) passano.
 */
const ALLOW_HEADERS = ["authorization", "content-type", ...Object.values(HEADERS)].join(", ");
const EXPOSE_HEADERS = "x-request-id, retry-after";

function allowedOrigins(): string[] {
  return (process.env.MERCHANT_APP_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim().replace(/\/$/, ""))
    .filter(Boolean);
}

/** Origine ammessa della richiesta, null se non è una richiesta cross-origin. Lancia E_CORS_ORIGIN se non ammessa. */
export function checkOrigin(req: Request): string | null {
  const origin = req.headers.get("origin");
  if (!origin) return null;
  if (!allowedOrigins().includes(origin)) {
    throw new AppError("E_CORS_ORIGIN", `origine ${origin} non presente in MERCHANT_APP_ORIGINS`, { origin });
  }
  return origin;
}

export function withCorsHeaders(res: Response, req: Request): Response {
  const origin = req.headers.get("origin");
  if (!origin || !allowedOrigins().includes(origin)) return res;
  const out = new Response(res.body, res);
  out.headers.set("access-control-allow-origin", origin);
  out.headers.set("access-control-expose-headers", EXPOSE_HEADERS);
  out.headers.append("vary", "Origin");
  return out;
}

/** Risposta alle richieste preflight OPTIONS. */
export async function preflight(req: Request): Promise<Response> {
  const origin = req.headers.get("origin");
  if (!origin || !allowedOrigins().includes(origin)) return new Response(null, { status: 403 });
  return new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": origin,
      "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
      "access-control-allow-headers": ALLOW_HEADERS,
      "access-control-max-age": "600",
      vary: "Origin",
    },
  });
}
