import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { sessionCookieOptions } from "./lib/session-cookie-options";

/**
 * Pannello interno (/interno) e login unico (/accesso): rinnova i cookie della sessione web prima
 * della pagina, perché i Server Component non possono scriverli (le API esercente li rinnovano da
 * sé, vedi merchantRoute). Il controllo dei permessi resta nelle pagine e nelle azioni
 * (supportPage / supportAction / lib/access.ts); qui nessuna decisione di accesso.
 * Queste pagine non vanno indicizzate.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url && key) {
    const sb = createServerClient(url, key, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) => {
          for (const c of list) request.cookies.set(c.name, c.value);
          response = NextResponse.next({ request });
          for (const c of list) response.cookies.set(c.name, c.value, { ...c.options, ...sessionCookieOptions() });
        },
      },
    });
    await sb.auth.getUser();
  }
  response.headers.set("x-robots-tag", "noindex, nofollow");
  return response;
}

export const config = { matcher: ["/interno", "/interno/:path*", "/accesso", "/accesso/:path*"] };
