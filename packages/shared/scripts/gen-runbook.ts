/**
 * Genera le sezioni "Eventi di log" ed "Errori" di docs/runbook-assistenza.md dai cataloghi
 * (packages/shared/logging/events.ts e packages/shared/errors.ts), così la documentazione
 * per l'assistenza non diverge dal codice. Il resto del runbook è scritto a mano.
 *
 *   pnpm runbook          rigenera
 *   pnpm runbook:check    fallisce se il runbook non è allineato (usato in CI)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { errors } from "../errors";
import { events, type EventName } from "../logging/events";

const file = join(dirname(fileURLToPath(import.meta.url)), "../../../docs/runbook-assistenza.md");
const START = "<!-- INIZIO SEZIONE GENERATA: non modificare a mano, eseguire `pnpm runbook` -->";
const END = "<!-- FINE SEZIONE GENERATA -->";

const cell = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");

const DOMAINS: Record<string, string> = {
  server: "Avvio del server",
  http: "Richieste API",
  external: "Chiamate a servizi esterni",
  diagnostic: "Modalità diagnostica",
  wallet: "Wallet (Google / Apple)",
};

function eventsSection(): string {
  const names = Object.keys(events) as EventName[];
  const byDomain = new Map<string, EventName[]>();
  for (const n of names) {
    const d = n.split(".")[0] ?? n;
    byDomain.set(d, [...(byDomain.get(d) ?? []), n]);
  }
  const out = [
    "## Eventi di log",
    "",
    "Ogni riga di log ha un campo `event` (uno di questi) e un `msg` da leggere.",
    "",
  ];
  for (const [domain, list] of byDomain) {
    out.push(
      `### ${DOMAINS[domain] ?? domain}`,
      "",
      "| Evento | Livello | Quando compare | Esempio di `msg` |",
      "| --- | --- | --- | --- |",
    );
    for (const n of list) {
      const def = events[n];
      const example = (def.msg as (f: unknown) => string)(def.examples[0]);
      out.push(`| \`${n}\` | ${def.level} | ${cell(def.description)} | ${cell(example)} |`);
    }
    out.push("");
  }
  return out.join("\n");
}

function errorsSection(): string {
  const out = [
    "## Errori",
    "",
    "Il codice (`error_code` nei log, `error.code` nelle risposte API) indica cosa è andato storto.",
    "",
  ];
  for (const [code, def] of Object.entries(errors)) {
    out.push(
      `### \`${code}\` (HTTP ${def.status})`,
      "",
      `- **L'utente vede**: ${def.userMessage}`,
      `- **Cosa è successo**: ${def.description}`,
      `- **Causa probabile**: ${def.probableCause}`,
      `- **Cosa fare**: ${def.action}`,
      "",
    );
  }
  return out.join("\n");
}

const current = readFileSync(file, "utf8");
const start = current.indexOf(START);
const end = current.indexOf(END);
if (start < 0 || end < start) {
  console.error(`✖ Marcatori della sezione generata non trovati in ${file}`);
  process.exit(1);
}
const next = `${current.slice(0, start + START.length)}\n\n${eventsSection()}\n${errorsSection()}\n${current.slice(end)}`;

if (process.argv.includes("--check")) {
  if (next !== current) {
    console.error("✖ docs/runbook-assistenza.md non è allineato ai cataloghi: eseguire `pnpm runbook` e committare.");
    process.exit(1);
  }
  console.log("✔ Runbook allineato ai cataloghi.");
} else {
  writeFileSync(file, next);
  console.log("✔ docs/runbook-assistenza.md aggiornato dai cataloghi.");
}
