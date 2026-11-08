import "server-only";
import { createServerClient, parseCookieHeader, serializeCookieHeader, type CookieOptions } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { requireEnv } from "./env";
import { sessionCookieOptions } from "./session-cookie-options";

export { sessionCookieOptions };

/**
 * Sessione web unica (login su /accesso): Supabase Auth nei cookie httpOnly, condivisa dal pannello
 * interno (/interno) e dalla web app esercente (/app), che stanno sullo stesso dominio. I token non
 * sono mai leggibili dagli script della pagina; le app iOS e Android continuano a usare il token Bearer.
 */

export type CookieToSet = { name: string; value: string; options: CookieOptions };

function client(getAll: () => { name: string; value: string }[], setAll: (list: CookieToSet[]) => void) {
  return createServerClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"), {
    cookieOptions: sessionCookieOptions(),
    cookies: {
      getAll,
      setAll: (list) => setAll(list.map((c) => ({ ...c, options: { ...c.options, ...sessionCookieOptions() } }))),
    },
  });
}

/**
 * Client con la sessione nei cookie per pagine e Server Action. Nei Server Component i cookie non
 * si scrivono: li rinnova proxy.ts alla richiesta successiva.
 */
export async function cookieSessionClient(): Promise<SupabaseClient> {
  const store = await cookies();
  return client(
    () => store.getAll(),
    (list) => {
      try {
        for (const c of list) store.set(c.name, c.value, c.options);
      } catch {
        // Server Component: i cookie li rinnova proxy.ts
      }
    },
  );
}

/** Nome dei cookie di Supabase Auth (anche spezzati in più parti: sb-<ref>-auth-token.0, .1…). */
const isAuthCookie = (name: string) => /^sb-.+-auth-token(\.\d+)?$/.test(name);

/** La richiesta porta un cookie di sessione web. */
export function hasSessionCookie(req: Request): boolean {
  return parseCookieHeader(req.headers.get("cookie") ?? "").some((c) => isAuthCookie(c.name));
}

export interface RequestSession {
  sb: SupabaseClient;
  /** Cookie da scrivere nella risposta (sessione rinnovata o chiusa). */
  pending: CookieToSet[];
}

/**
 * Client con la sessione letta dall'header Cookie della richiesta, per le route API: niente
 * next/headers (funziona anche negli smoke test che chiamano le route senza server). Se Supabase
 * rinnova la sessione, i cookie nuovi finiscono in `pending` e vanno aggiunti alla risposta.
 */
export function requestSessionClient(req: Request): RequestSession {
  const jar = parseCookieHeader(req.headers.get("cookie") ?? "").map((c) => ({ name: c.name, value: c.value ?? "" }));
  const pending: CookieToSet[] = [];
  const sb = client(
    () => jar,
    (list) => {
      for (const c of list) {
        const i = pending.findIndex((p) => p.name === c.name);
        if (i >= 0) pending[i] = c;
        else pending.push(c);
      }
    },
  );
  return { sb, pending };
}

/** Aggiunge alla risposta i cookie di sessione da scrivere (Set-Cookie). */
export function withSessionCookies(res: Response, pending: CookieToSet[]): Response {
  if (pending.length === 0) return res;
  const out = new Response(res.body, res);
  for (const c of pending) out.headers.append("set-cookie", serializeCookieHeader(c.name, c.value, c.options));
  return out;
}
