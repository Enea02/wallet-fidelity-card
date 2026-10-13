/**
 * Modalità diagnostica da riga di comando (fino al pannello interno della Fase 9).
 *
 *   pnpm diag list
 *   pnpm diag enable --shop salone-demo --reason "timbri non arrivano" --by enea [--hours 24] [--level debug]
 *   pnpm diag enable --staff giulia@salone.it --reason "…" --by enea
 *   pnpm diag enable --customer <uuid> --reason "…" --by enea
 *   pnpm diag disable <id> --by enea
 *
 * Usa le variabili di apps/web/.env.local (in produzione: quelle dell'ambiente).
 */
import { parseArgs } from "node:util";
import type { DiagnosticScopeType } from "@loyalty/shared/logging/events";
import type { DiagnosticMode } from "@/lib/observability/diagnostic-state";
import { diagnosticFields } from "@/lib/observability/diagnostic";
import { log } from "@/lib/observability/logger";
import { supabaseAdmin } from "@/lib/supabase";

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    shop: { type: "string" },
    staff: { type: "string" },
    customer: { type: "string" },
    reason: { type: "string" },
    by: { type: "string" },
    hours: { type: "string", default: "24" },
    level: { type: "string", default: "debug" },
  },
});

function fail(message: string): never {
  console.error(`✖ ${message}`);
  process.exit(1);
}

async function resolveScope(): Promise<{ type: DiagnosticScopeType; id: string; label: string }> {
  const db = supabaseAdmin();
  if (values.shop) {
    const { data } = await db.from("shops").select("id, slug").eq("slug", values.shop).maybeSingle();
    if (!data) fail(`negozio "${values.shop}" non trovato`);
    return { type: "shop", id: data.id as string, label: data.slug as string };
  }
  if (values.staff) {
    const { data, error } = await db.auth.admin.listUsers({ perPage: 1000 });
    if (error) fail(error.message);
    const user = data.users.find((u) => u.email?.toLowerCase() === values.staff?.toLowerCase());
    if (!user) fail(`utente staff "${values.staff}" non trovato`);
    return { type: "staff_user", id: user.id, label: user.email ?? user.id };
  }
  if (values.customer) {
    const { data } = await db.from("customers").select("id").eq("id", values.customer).maybeSingle();
    if (!data) fail(`cliente "${values.customer}" non trovato`);
    return { type: "customer", id: data.id as string, label: data.id as string };
  }
  return fail("indicare --shop <slug>, --staff <email> o --customer <id>");
}

async function main() {
  const [command, id] = positionals;
  const db = supabaseAdmin();

  if (command === "list") {
    const { data, error } = await db
      .from("diagnostic_modes")
      .select("id, scope_type, scope_label, level, reason, enabled_by, expires_at")
      .is("disabled_at", null)
      .is("expired_logged_at", null)
      .order("expires_at");
    if (error) fail(error.message);
    if (!data.length) console.log("Nessuna modalità diagnostica attiva.");
    for (const m of data) {
      console.log(
        `${m.id}  ${m.scope_type} ${m.scope_label}  ${m.level} fino a ${m.expires_at}  (${m.enabled_by}: ${m.reason})`,
      );
    }
    return;
  }

  if (!values.by) fail("indicare chi esegue l'operazione con --by <nome>");

  if (command === "enable") {
    if (!values.reason) fail('indicare il motivo con --reason "…"');
    const scope = await resolveScope();
    const { data, error } = await db
      .rpc("enable_diagnostic_mode", {
        p_scope_type: scope.type,
        p_scope_id: scope.id,
        p_scope_label: scope.label,
        p_reason: values.reason,
        p_enabled_by: values.by,
        p_level: values.level,
        p_hours: Number(values.hours),
      })
      .single<DiagnosticMode>();
    if (error) fail(error.message);
    log.event("diagnostic.mode.enabled", diagnosticFields(data));
    console.log(`✔ Attivata (id ${data.id}); i server la applicano entro 30 secondi.`);
    return;
  }

  if (command === "disable") {
    if (!id) fail("indicare l'id della modalità: pnpm diag disable <id> --by <nome>");
    const { data, error } = await db
      .rpc("disable_diagnostic_mode", { p_id: id, p_disabled_by: values.by })
      .maybeSingle<DiagnosticMode>();
    if (error) fail(error.message);
    if (!data) fail("modalità non trovata o già chiusa");
    log.event("diagnostic.mode.disabled", { ...diagnosticFields(data), disabled_by: values.by });
    console.log("✔ Disattivata; i server tornano al livello normale entro 30 secondi.");
    return;
  }

  fail("comando sconosciuto: usare list, enable o disable");
}

await main();
