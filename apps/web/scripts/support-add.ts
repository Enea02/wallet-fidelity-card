/**
 * Aggiunge una persona al team interno (accesso al pannello /interno con 2FA).
 *
 *   pnpm support:add <email> --name "Sara" --by "Enea"
 *
 * Se l'account non esiste lo crea e chiede la password (nascosta, minimo 12 caratteri); in modo
 * non interattivo la legge da SUPPORT_ADD_PASSWORD. L'app di autenticazione si collega al primo accesso.
 * Usa le variabili di apps/web/.env.local (in produzione: quelle dell'ambiente).
 */
import { createInterface } from "node:readline";
import { parseArgs } from "node:util";
import { maskEmail } from "@loyalty/shared/logger";
import { newRequestId } from "@loyalty/shared/logging/request-id";
import { runWithContext } from "@/lib/observability/context";
import { flushLogs } from "@/lib/observability/db-sink";
import { log } from "@/lib/observability/logger";
import { supabaseAdmin } from "@/lib/supabase";

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { name: { type: "string" }, by: { type: "string" } },
});

function fail(message: string): never {
  console.error(`✖ ${message}`);
  process.exit(1);
}

function askHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const out = rl as unknown as { _writeToOutput: (s: string) => void; output: NodeJS.WriteStream };
    out._writeToOutput = (s: string) => {
      if (s.includes(question)) out.output.write(s);
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
  });
}

async function choosePassword(): Promise<string> {
  const fromEnv = process.env.SUPPORT_ADD_PASSWORD;
  if (fromEnv) return fromEnv;
  if (!process.stdin.isTTY) fail("password richiesta: lanciare da un terminale o impostare SUPPORT_ADD_PASSWORD");
  const a = await askHidden("Password per il nuovo account (min 12 caratteri): ");
  const b = await askHidden("Ripeti la password: ");
  if (a !== b) fail("le due password non coincidono");
  return a;
}

async function main() {
  const email = positionals[0]?.trim().toLowerCase();
  if (!email || !email.includes("@")) fail("indicare l'email: pnpm support:add <email> --name <nome> --by <chi>");
  if (!values.name || values.name.trim().length < 2) fail("indicare il nome con --name");
  if (!values.by) fail("indicare chi aggiunge la persona con --by");
  const db = supabaseAdmin();

  const { data: existingId, error } = await db.rpc("find_user_id_by_email", { p_email: email });
  if (error) throw error;
  let userId = existingId as string | null;
  if (!userId) {
    const password = await choosePassword();
    if (password.length < 12) fail("la password deve avere almeno 12 caratteri");
    const { data, error: createError } = await db.auth.admin.createUser({ email, password, email_confirm: true });
    if (createError || !data.user) fail(`account non creato: ${createError?.message ?? "utente assente"}`);
    userId = data.user.id;
  }

  await runWithContext(
    { request_id: newRequestId(), platform: "script", role: "support", user_id: userId },
    async () => {
      const meta = { actor_type: "support", actor_id: values.by, platform: "script" };
      const { error: addError } = await db.rpc("support_member_add", {
        p_user_id: userId,
        p_display_name: values.name,
        p_email: email,
        p_meta: meta,
      });
      if (addError) throw addError;
      log.event("support.member.added", {
        support_name: values.name!.trim(),
        email: maskEmail(email),
        added_by: values.by!,
        existing_account: existingId !== null,
      });
      await flushLogs();
    },
  );
  console.log(
    `✔ ${values.name} aggiunto al team: accesso da /interno/accesso, al primo accesso si collega l'app di autenticazione.`,
  );
}

await main();
