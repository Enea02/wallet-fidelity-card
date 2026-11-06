import { AppError } from "@loyalty/shared/errors";
import { HEADERS } from "@loyalty/shared/api";
import { siteOrigin } from "../merchant-app";

/**
 * CORS delle API esercente. La web app esercente è servita dallo stesso server (/app), quindi la
 * sua origine è quella del sito (APP_BASE_URL), sempre ammessa: il browser manda Origin anche nelle
 * POST dalla stessa origine. MERCHANT_APP_ORIGINS (facoltativa, separate da virgola) aggiunge altre
 * origini, es. l'app in sviluppo con ricarica a caldo su http://localhost:8081.
 * Le richieste dalla stessa origine del server (Origin con lo stesso host della richiesta) passano
 * sempre: non possono essere CSRF e capitano quando il sito si apre da un indirizzo diverso da
 * APP_BASE_URL (es. localhost con APP_BASE_URL su un tunnel). Le richieste senza Origin (app
 * iOS/Android, script) passano.
 */
const ALLOW_HEADERS = ["authorization", "content-type", ...Object.values(HEADERS)].join(", ");
const EXPOSE_HEADERS = "x-request-id, retry-after";

function allowedOrigins(): string[] {
  const extra = (process.env.MERCHANT_APP_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim().replace(/\/$/, ""))
    .filter(Boolean);
  const site = siteOrigin();
  return site ? [site, ...extra] : extra;
}

/** Origin con lo stesso host a cui è arrivata la richiesta (il browser non la può falsificare). */
function isSameOrigin(req: Request, origin: string): boolean {
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return false;
  }
  const host = req.headers.get("host") ?? new URL(req.url).host;
  return originHost === host;
}

/** L'origine della richiesta è ammessa (stessa origine, sito o MERCHANT_APP_ORIGINS). */
function isAllowed(req: Request, origin: string): boolean {
  return isSameOrigin(req, origin) || allowedOrigins().includes(origin);
}

/** L'origine è ammessa (sito o MERCHANT_APP_ORIGINS). */
export function isAllowedOrigin(origin: string): boolean {
  return allowedOrigins().includes(origin);
}

/** Origine ammessa della richiesta, null se non è una richiesta cross-origin. Lancia E_CORS_ORIGIN se non ammessa. */
export function checkOrigin(req: Request): string | null {
  const origin = req.headers.get("origin");
  if (!origin) return null;
  if (!isAllowed(req, origin)) {
    throw new AppError(
      "E_CORS_ORIGIN",
      `origine ${origin} diversa dal server, dal sito (APP_BASE_URL) e non presente in MERCHANT_APP_ORIGINS`,
      { origin },
    );
  }
  return origin;
}

export function withCorsHeaders(res: Response, req: Request): Response {
  const origin = req.headers.get("origin");
  if (!origin || !isAllowed(req, origin)) return res;
  const out = new Response(res.body, res);
  out.headers.set("access-control-allow-origin", origin);
  out.headers.set("access-control-expose-headers", EXPOSE_HEADERS);
  // la web app sul web si autentica con il cookie di sessione (anche da un'altra porta in sviluppo)
  out.headers.set("access-control-allow-credentials", "true");
  out.headers.append("vary", "Origin");
  return out;
}

/** Risposta alle richieste preflight OPTIONS. */
export async function preflight(req: Request): Promise<Response> {
  const origin = req.headers.get("origin");
  if (!origin || !isAllowed(req, origin)) return new Response(null, { status: 403 });
  return new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": origin,
      "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
      "access-control-allow-headers": ALLOW_HEADERS,
      "access-control-allow-credentials": "true",
      "access-control-max-age": "600",
      vary: "Origin",
    },
  });
}
