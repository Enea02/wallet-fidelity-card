/**
 * Sessione web del login unico: cookie httpOnly condivisi da pannello interno e web app esercente
 * (/app). Passaggio della sessione dal link dell'email, uso del cookie con le API esercente, uscita
 * e protezione dalle richieste di altri siti.
 */
import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { MARCO, SALONE, SITE_ORIGIN, call, cookieFor } from "./support/merchant";

const env = (k: string) => process.env[k] ?? "";

/** Sessione appena aperta come dal link dell'email (token di accesso e di rinnovo). */
async function freshSession(email: string) {
  const anon = createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("NEXT_PUBLIC_SUPABASE_ANON_KEY"), {
    auth: { persistSession: false },
  });
  const { data, error } = await anon.auth.signInWithPassword({ email, password: "password-demo-locale" });
  if (error || !data.session) throw new Error(error?.message ?? "nessuna sessione");
  return data.session;
}

/** Header Cookie a partire dai Set-Cookie di una risposta. */
const cookieHeader = (res: Response) =>
  res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .filter((c) => !c!.endsWith("="))
    .join("; ");

describe("sessione web (login unico)", () => {
  it("il link dell'email passa ai cookie httpOnly e il cookie autentica le API esercente", async () => {
    const s = await freshSession("operatore@salone-demo.test");
    const r = await call("sessionHandoff", {
      token: s.access_token,
      origin: SITE_ORIGIN,
      body: { refreshToken: s.refresh_token, reason: "invito" },
    });
    expect(r.status).toBe(200);
    const set = r.res.headers.getSetCookie();
    expect(set.some((c) => /^sb-.+-auth-token(\.\d+)?=/.test(c))).toBe(true);
    for (const c of set) {
      expect(c).toMatch(/HttpOnly/i);
      expect(c).toMatch(/SameSite=Lax/i);
    }

    const me = await call("me", { cookie: cookieHeader(r.res) });
    expect(me.status).toBe(200);
    expect((me.json?.user as { id: string }).id).toBe(MARCO);
  });

  it("senza token Bearer il passaggio è rifiutato (serve la sessione del link)", async () => {
    const r = await call("sessionHandoff", {
      cookie: await cookieFor("operatore@salone-demo.test"),
      origin: SITE_ORIGIN,
      body: { refreshToken: "x".repeat(20), reason: "invito" },
    });
    expect([r.status, r.code]).toEqual([400, "E_VALIDATION"]);
  });

  it("le richieste che cambiano dati da un altro sito sono rifiutate anche con il cookie", async () => {
    const r = await call("lookup", {
      cookie: await cookieFor("staff@salone-demo.test"),
      origin: "https://sito-di-terzi.example",
      shopId: SALONE,
      body: { code: "ABC123" },
    });
    expect([r.status, r.code]).toEqual([403, "E_CORS_ORIGIN"]);
  });

  it("Esci chiude la sessione web: cookie cancellati e sessione non più valida", async () => {
    const cookie = await cookieFor("staff@salone-demo.test", true);
    expect((await call("me", { cookie })).status).toBe(200);
    const out = await call("logout", { cookie, origin: SITE_ORIGIN });
    expect(out.status).toBe(200);
    expect(out.res.headers.getSetCookie().some((c) => /Max-Age=0/i.test(c))).toBe(true);
    const after = await call("me", { cookie });
    expect([after.status, after.code]).toEqual([401, "E_AUTH_INVALID"]);
  });
});
