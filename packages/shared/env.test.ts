import { describe, expect, it } from "vitest";
import { z } from "zod";
import { parseEnv } from "./env";
import { AppError } from "./errors";

const schema = z.object({
  DB_URL: z.url().describe("URL del database"),
  SECRET_KEY: z.string().min(10).describe("chiave segreta del servizio"),
  OPTIONAL_FLAG: z.string().optional().describe("facoltativa"),
});

function failure(source: Record<string, string | undefined>): AppError {
  try {
    parseEnv("web", schema, source);
  } catch (e) {
    if (e instanceof AppError) return e;
    throw e;
  }
  throw new Error("parseEnv avrebbe dovuto fallire");
}

describe("parseEnv", () => {
  it("accetta una configurazione completa e toglie gli spazi", () => {
    const env = parseEnv("web", schema, { DB_URL: " https://db.example.com ", SECRET_KEY: "abcdefghijkl" });
    expect(env).toEqual({ DB_URL: "https://db.example.com", SECRET_KEY: "abcdefghijkl" });
  });

  it("elenca tutte le variabili mancanti, con la loro descrizione, in un solo errore", () => {
    const err = failure({ OPTIONAL_FLAG: "x" });
    expect(err.code).toBe("E_CONFIG_INVALID");
    expect(err.context.missing).toEqual(["DB_URL", "SECRET_KEY"]);
    expect(err.message).toContain("DB_URL: manca — URL del database");
    expect(err.message).toContain("SECRET_KEY: manca — chiave segreta del servizio");
    expect(err.message).toContain("apps/web/.env.example");
  });

  it("una variabile vuota vale come mancante", () => {
    expect(failure({ DB_URL: "https://db.example.com", SECRET_KEY: "   " }).context.missing).toEqual(["SECRET_KEY"]);
  });

  it("distingue i valori malformati e non li riporta mai", () => {
    const secret = "sk-troppo";
    const badUrl = "postgres-senza-schema-segreto";
    const err = failure({ DB_URL: badUrl, SECRET_KEY: secret });
    expect(err.context.invalid).toEqual(["DB_URL", "SECRET_KEY"]);
    const everything = `${err.message} ${JSON.stringify(err.context)}`;
    expect(everything).not.toContain(secret);
    expect(everything).not.toContain(badUrl);
  });
});
