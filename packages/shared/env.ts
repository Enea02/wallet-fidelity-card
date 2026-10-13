import type { z } from "zod";
import { AppError } from "./errors";

export interface EnvProblem {
  /** Nome della variabile (mai il valore). */
  name: string;
  kind: "missing" | "invalid";
  /** Spiegazione in italiano: a cosa serve la variabile o cosa non va. */
  hint: string;
}

type EnvSource = Record<string, string | undefined>;

/**
 * Valida le variabili d'ambiente di un'app con uno schema zod.
 * Le variabili vuote valgono come assenti. In caso di errore lancia `E_CONFIG_INVALID`
 * con un messaggio che elenca nomi e spiegazioni, **mai i valori**.
 */
export function parseEnv<S extends z.ZodObject>(app: string, schema: S, source: EnvSource): z.output<S> {
  const cleaned: EnvSource = {};
  for (const [k, v] of Object.entries(source)) {
    if (v !== undefined && v.trim() !== "") cleaned[k] = v.trim();
  }

  const result = schema.safeParse(cleaned);
  if (result.success) return result.data;

  const problems = new Map<string, EnvProblem>();
  for (const issue of result.error.issues) {
    const name = String(issue.path[0] ?? "(configurazione)");
    if (problems.has(name)) continue;
    const field = schema.shape[name] as z.ZodType | undefined;
    const purpose = field?.description ?? "vedi .env.example";
    const missing = cleaned[name] === undefined;
    problems.set(name, {
      name,
      kind: missing ? "missing" : "invalid",
      // i messaggi "custom" sono scritti da noi negli schemi e non contengono valori
      hint: issue.code === "custom" ? issue.message : missing ? purpose : `formato non valido (${purpose})`,
    });
  }

  const list = [...problems.values()];
  throw new AppError("E_CONFIG_INVALID", formatEnvProblems(app, list), {
    app,
    missing: list.filter((p) => p.kind === "missing").map((p) => p.name),
    invalid: list.filter((p) => p.kind === "invalid").map((p) => p.name),
  });
}

export function formatEnvProblems(app: string, problems: EnvProblem[]): string {
  const lines = problems.map((p) => `  - ${p.name}: ${p.kind === "missing" ? "manca" : "non valida"} — ${p.hint}`);
  return `Configurazione non valida per apps/${app} (${problems.length} problemi). Correggi le variabili d'ambiente (in locale apps/${app}/.env.local) confrontandole con apps/${app}/.env.example:\n${lines.join("\n")}`;
}
