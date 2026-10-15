import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Solo per il pannello interno (/interno): rinnova i cookie della sessione Supabase prima della
 * pagina, perché i Server Component non possono scriverli. Il controllo dei permessi resta nelle
 * pagine e nelle azioni (supportPage / supportAction); qui nessuna decisione di accesso.
 * Le pagine del pannello non vanno indicizzate.
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
          for (const c of list)
            response.cookies.set(c.name, c.value, { ...c.options, httpOnly: true, sameSite: "lax" });
        },
      },
    });
    await sb.auth.getUser();
  }
  response.headers.set("x-robots-tag", "noindex, nofollow");
  return response;
}

export const config = { matcher: ["/interno", "/interno/:path*"] };
