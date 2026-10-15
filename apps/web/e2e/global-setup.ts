import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { createClient } from "@supabase/supabase-js";
import { generate } from "otplib";
import { admin } from "./helpers";

/*
 * Setup degli e2e:
 * - endpoint del token OAuth di Google che risponde 401: ogni chiamata a Google Wallet fallisce come con
 *   credenziali del service account sbagliate (E_GOOGLE_AUTH), uno dei problemi della prova «alla cieca»;
 * - membro del team interno con l'app di autenticazione già collegata (segreto TOTP in e2e-logs/interno.json).
 */
export const GOOGLE_TOKEN_PORT = 3199;
export const SUPPORT_FILE = "e2e-logs/interno.json";

export default async function globalSetup() {
  const server = createServer((req, res) => {
    req.resume();
    res.writeHead(401, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "invalid_client", error_description: "The OAuth client was not found." }));
  });
  await new Promise<void>((resolve) => server.listen(GOOGLE_TOKEN_PORT, "127.0.0.1", resolve));

  const email = `assistenza-e2e-${Date.now()}@loyaltywallet.test`;
  const password = randomBytes(18).toString("base64url");
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw new Error(`utente di assistenza non creato: ${error?.message}`);
  const userId = data.user.id;
  const add = await admin.rpc("support_member_add", {
    p_user_id: userId,
    p_display_name: "Assistenza E2E",
    p_email: email,
    p_meta: { actor_type: "support", actor_id: "e2e", platform: "script" },
  });
  if (add.error) throw new Error(add.error.message);

  // collegamento dell'app di autenticazione come al primo accesso, ma da codice
  const url = process.env.E2E_SUPABASE_URL!;
  const anon = process.env.E2E_SUPABASE_ANON_KEY!;
  const sb = createClient(url, anon, { auth: { persistSession: false } });
  const signIn = await sb.auth.signInWithPassword({ email, password });
  if (signIn.error) throw new Error(signIn.error.message);
  const enrolled = await sb.auth.mfa.enroll({ factorType: "totp", friendlyName: "e2e" });
  if (enrolled.error) throw new Error(enrolled.error.message);
  const secret = enrolled.data.totp.secret;
  const verified = await sb.auth.mfa.challengeAndVerify({
    factorId: enrolled.data.id,
    code: await generate({ secret }),
  });
  if (verified.error) throw new Error(verified.error.message);
  writeFileSync(SUPPORT_FILE, JSON.stringify({ email, password, secret }), { mode: 0o600 });

  return async () => {
    server.close();
    await admin.auth.admin.deleteUser(userId).catch(() => undefined);
  };
}
