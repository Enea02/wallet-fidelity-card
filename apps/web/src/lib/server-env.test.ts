import { describe, expect, it } from "vitest";
import { AppError } from "@loyalty/shared/errors";
import { loadServerEnv } from "./server-env";

const base = {
  APP_BASE_URL: "http://localhost:3000",
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key-segretissima",
  ADMIN_SETUP_TOKEN: "a".repeat(32),
};
const saKey = Buffer.from(JSON.stringify({ client_email: "sa@x.iam", private_key: "-----BEGIN…" })).toString("base64");

function problems(source: Record<string, string | undefined>) {
  try {
    loadServerEnv(source);
  } catch (e) {
    if (e instanceof AppError) return e;
    throw e;
  }
  throw new Error("doveva fallire");
}

describe("configurazione del server web", () => {
  it("la configurazione minima di sviluppo è valida, con i wallet disattivati", () => {
    const env = loadServerEnv(base);
    expect(env.APP_ENV).toBe("development");
    expect(env.LOG_LEVEL).toBe("info");
    expect(env.GOOGLE_WALLET_ISSUER_ID).toBeUndefined();
  });

  it("accetta Google Wallet completo", () => {
    expect(() =>
      loadServerEnv({ ...base, GOOGLE_WALLET_ISSUER_ID: "3388000000022", GOOGLE_WALLET_SA_KEY_B64: saKey }),
    ).not.toThrow();
  });

  it("Google Wallet a metà è un errore che spiega cosa manca", () => {
    const err = problems({ ...base, GOOGLE_WALLET_ISSUER_ID: "3388000000022" });
    expect(err.context.missing).toEqual(["GOOGLE_WALLET_SA_KEY_B64"]);
    expect(err.message).toContain("sia GOOGLE_WALLET_ISSUER_ID sia GOOGLE_WALLET_SA_KEY_B64");
  });

  it("una chiave service account non valida viene segnalata senza riportarla", () => {
    const bad = Buffer.from('{"non":"una chiave"}').toString("base64");
    const err = problems({ ...base, GOOGLE_WALLET_ISSUER_ID: "3388000000022", GOOGLE_WALLET_SA_KEY_B64: bad });
    expect(err.context.invalid).toEqual(["GOOGLE_WALLET_SA_KEY_B64"]);
    expect(err.message).not.toContain(bad);
  });

  it("nessun segreto finisce nel messaggio d'errore", () => {
    const shortToken = "tok-XYZ-breve";
    const err = problems({ ...base, APP_BASE_URL: undefined, ADMIN_SETUP_TOKEN: shortToken });
    expect(err.context).toMatchObject({ missing: ["APP_BASE_URL"], invalid: ["ADMIN_SETUP_TOKEN"] });
    const text = `${err.message} ${JSON.stringify(err.context)}`;
    for (const secret of [base.SUPABASE_SERVICE_ROLE_KEY, base.NEXT_PUBLIC_SUPABASE_ANON_KEY, shortToken]) {
      expect(text).not.toContain(secret);
    }
  });
});
