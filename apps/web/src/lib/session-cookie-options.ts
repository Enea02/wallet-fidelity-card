import type { CookieOptions } from "@supabase/ssr";

/**
 * Opzioni dei cookie della sessione web (login unico): httpOnly, SameSite=Lax, Secure quando il
 * sito è in https. In un file a sé perché le usa anche proxy.ts (niente "server-only" lì).
 */
export function sessionCookieOptions(): CookieOptions {
  return {
    path: "/",
    sameSite: "lax",
    httpOnly: true,
    secure: (process.env.APP_BASE_URL ?? "").startsWith("https://"),
  };
}
