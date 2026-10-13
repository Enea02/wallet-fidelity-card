import { describe, expect, it } from "vitest";
import { maskPhone, redact, redactString, REDACTED } from "./redact";

// Valori finti costruiti a runtime: nel repository non devono esserci stringhe con la forma
// di un segreto (gitleaks e la push protection di GitHub le bloccano, giustamente).
const b64url = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = [b64url({ alg: "RS256", typ: "JWT" }), b64url({ iss: "sa@progetto.iam" }), "ZmlybWEtZmludGE"].join(".");
const qr = "0123456789abcdef".repeat(2);
const PEM_BEGIN = ["-----BEGIN", "PRIVATE", "KEY-----"].join(" ");
const PEM_END = ["-----END", "PRIVATE", "KEY-----"].join(" ");
const saKey = b64url({ client_email: "sa@progetto.iam" });

describe("redazione per nome del campo", () => {
  const input = {
    authorization: "Bearer abc.def.ghi",
    headers: { Authorization: "Bearer xyz", cookie: "sb-access-token=segreto", "x-admin-token": "admin-segreto" },
    password: "password-demo-locale",
    otp: "123456",
    access_token: "tok-1",
    refresh_token: "tok-2",
    apikey: "chiave",
    private_key: `${PEM_BEGIN}abc`,
    GOOGLE_WALLET_SA_KEY_B64: saKey,
    IP_HASH_SALT: "sale",
    authenticationToken: "apple-segreto",
    jwt,
    qr_token: qr,
    qrToken: qr,
    phone: "+39 333 1234567",
    nested: [{ deeper: { password: "x", ok: "visibile" } }],
  };
  const out = redact(input);
  const text = JSON.stringify(out);

  it("nessun segreto compare in chiaro", () => {
    for (const secret of [
      "abc.def.ghi",
      "xyz",
      "sb-access-token=segreto",
      "admin-segreto",
      "password-demo-locale",
      "123456",
      "tok-1",
      "tok-2",
      "chiave",
      PEM_BEGIN,
      saKey,
      "sale",
      "apple-segreto",
      jwt,
      qr,
      "1234567",
    ]) {
      expect(text).not.toContain(secret);
    }
  });

  it("qr_token resta riconoscibile dai primi 4 caratteri, il telefono è mascherato", () => {
    expect(out.qr_token).toBe("0123…");
    expect(out.qrToken).toBe("0123…");
    expect(out.phone).toBe("+39 333 ***4567");
  });

  it("i campi normali restano intatti e l'originale non viene modificato", () => {
    expect(out.nested[0]?.deeper.ok).toBe("visibile");
    expect(out.password).toBe(REDACTED);
    expect(input.password).toBe("password-demo-locale");
  });
});

describe("redazione per contenuto (dentro qualsiasi stringa)", () => {
  it.each([
    ["JWT", `link https://pay.google.com/gp/v/save/${jwt} generato`, jwt],
    ["Bearer", "header era Bearer sk_live_123456789 ok", "sk_live_123456789"],
    // chiave finta costruita a runtime: nel repository non deve esserci nemmeno una chiave di esempio reale
    ["chiave Supabase", `usata ${["sb", "secret", "Fake0Key0Per0Test0Redazione"].join("_")}`, "Fake0Key0Per0Test"],
    ["qr_token", `QR letto: ${qr}`, qr],
    ["telefono", "cliente +39 333 123 4567 iscritto", "123 4567"],
    ["telefono compatto", "tel +393331234567", "3331234567"],
    ["chiave PEM", `${PEM_BEGIN}\nMIIEv\n${PEM_END}`, "MIIEv"],
  ])("%s", (_name, input, secret) => {
    expect(redactString(input)).not.toContain(secret);
  });

  it("non tocca date, durate, UUID e request_id", () => {
    const s =
      "2026-11-03T09:32:14.512Z +02:00 in 341 ms 11111111-1111-4111-8111-111111111111 01JB7K3QX0ABCDEFGHJKMNPQRS";
    expect(redactString(s)).toBe(s);
  });

  it("errori e oggetti circolari sono gestiti", () => {
    const err = new Error(`fallito con token ${jwt}`);
    const circ: Record<string, unknown> = { a: 1 };
    circ.self = circ;
    const out = redact({ err, circ }) as { err: { message: string; stack?: string }; circ: Record<string, unknown> };
    expect(out.err.message).not.toContain(jwt);
    expect(out.err.stack).not.toContain(jwt);
    expect(out.circ.self).toBe("[circolare]");
  });
});

describe("maskPhone", () => {
  it.each([
    ["+39 333 1234567", "+39 333 ***4567"],
    ["+393331234567", "+39 333 ***4567"],
    ["+41 79 123 45 67", "+41 ***4567"],
    ["123", "***"],
  ])("%s → %s", (input, expected) => {
    expect(maskPhone(input)).toBe(expected);
  });
});
