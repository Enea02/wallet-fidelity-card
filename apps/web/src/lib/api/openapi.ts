import { ErrorBody, HEADERS, merchantApi, type EndpointDef } from "@loyalty/shared/api";
import { errors } from "@loyalty/shared/errors";
import { z } from "zod";

/**
 * Documento OpenAPI 3.1 generato dal registro dei contratti zod: la documentazione
 * non può divergere dal codice. Pubblicato solo in sviluppo (/api/v1/docs).
 */
const schema = (s: z.ZodType, io: "input" | "output") =>
  z.toJSONSchema(s, { io, unrepresentable: "any", target: "draft-2020-12" }) as Record<string, unknown>;

function parameters(def: EndpointDef) {
  const out: Array<Record<string, unknown>> = [];
  if (def.auth !== "user") {
    out.push({
      name: HEADERS.shopId,
      in: "header",
      required: true,
      description: "Negozio su cui si opera",
      schema: { type: "string", format: "uuid" },
    });
  }
  for (const [where, s] of [
    ["path", def.params],
    ["query", def.query],
  ] as const) {
    if (!s) continue;
    const js = schema(s, "input") as { properties?: Record<string, unknown>; required?: string[] };
    for (const [name, prop] of Object.entries(js.properties ?? {})) {
      out.push({ name, in: where, required: where === "path" || (js.required ?? []).includes(name), schema: prop });
    }
  }
  return out;
}

export function buildOpenApi(): Record<string, unknown> {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const [key, def] of Object.entries(merchantApi) as Array<[string, EndpointDef]>) {
    const ok =
      def.response === "pdf"
        ? { "application/pdf": { schema: { type: "string", format: "binary" } } }
        : { "application/json": { schema: schema(def.response, "output") } };
    paths[def.path] ??= {};
    paths[def.path]![def.method.toLowerCase()] = {
      operationId: key,
      summary: def.summary,
      tags: [def.auth === "owner" ? "Titolare" : def.auth === "staff" ? "Staff" : "Utente"],
      description:
        def.auth === "owner"
          ? "Solo titolare."
          : def.auth === "staff"
            ? "Titolare e operatori."
            : "Utente autenticato.",
      security: [{ bearer: [] }],
      parameters: parameters(def),
      ...(def.body && {
        requestBody: { required: true, content: { "application/json": { schema: schema(def.body, "input") } } },
      }),
      responses: {
        "200": { description: "OK", content: ok },
        default: {
          description: `Errore del catalogo (${Object.keys(errors).length} codici, vedi docs/runbook-assistenza.md)`,
          content: { "application/json": { schema: schema(ErrorBody, "output") } },
        },
      },
    };
  }
  return {
    openapi: "3.1.0",
    info: {
      title: "Loyalty Wallet — API esercente",
      version: "1",
      description:
        "API dell'app esercente. Header facoltativi su tutte le richieste: X-Request-Id (ULID), X-Platform, X-App-Version, X-App-Build.",
    },
    components: { securitySchemes: { bearer: { type: "http", scheme: "bearer", bearerFormat: "JWT Supabase" } } },
    paths,
  };
}

export const docsEnabled = () => (process.env.APP_ENV ?? "development") === "development";
