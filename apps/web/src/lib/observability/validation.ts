import { AppError } from "@loyalty/shared/errors";
import { z } from "zod";

// messaggi di zod in italiano per tutto il server
z.config(z.locales.it());

/** Legge e valida il body JSON; errori → E_VALIDATION con il campo errato. */
export async function parseJsonBody<S extends z.ZodType>(req: Request, schema: S): Promise<z.output<S>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new AppError(
      "E_VALIDATION",
      "il body della richiesta non è JSON valido",
      {},
      {
        userMessage: "Richiesta non valida.",
      },
    );
  }
  const parsed = schema.safeParse(raw);
  if (parsed.success) return parsed.data;

  const fields = parsed.error.issues.map((i) => ({ field: i.path.join(".") || "(body)", problem: i.message }));
  const first = fields[0];
  throw new AppError(
    "E_VALIDATION",
    `dati non validi, ${fields.map((f) => `campo ${f.field}: ${f.problem}`).join("; ")}`,
    { fields: fields.map((f) => f.field) },
    { userMessage: first ? `Dati non validi: ${first.problem}` : "Dati non validi." },
  );
}
