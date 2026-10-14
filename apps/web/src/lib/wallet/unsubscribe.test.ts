import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { unsubscribeToken, unsubscribeUrl, verifyUnsubscribeToken } from "./unsubscribe";

beforeEach(() => {
  process.env.UNSUBSCRIBE_SECRET = "s".repeat(40);
  process.env.APP_BASE_URL = "https://timbri.example";
});
afterEach(() => {
  delete process.env.UNSUBSCRIBE_SECRET;
});

describe("link di disiscrizione firmato", () => {
  const c = "33333333-3333-4333-8333-333333333333";
  const p = "7d1e2b3c-4d5e-4f43-9a51-5f1c2a9e0d1b";

  it("si verifica e restituisce carta e promozione", () => {
    expect(verifyUnsubscribeToken(unsubscribeToken(c, p))).toEqual({ customerId: c, promotionId: p });
    expect(unsubscribeUrl(c, p)).toMatch(/^https:\/\/timbri\.example\/u\/[\w-]+\.[\w-]+$/);
  });

  it("manomesso o firmato con un altro segreto: rifiutato", () => {
    const t = unsubscribeToken(c, p);
    const [data, sig] = t.split(".");
    const forged = Buffer.from(JSON.stringify({ c: "altro", p })).toString("base64url");
    expect(verifyUnsubscribeToken(`${forged}.${sig}`)).toBeNull();
    expect(verifyUnsubscribeToken(`${data}.${sig?.slice(0, -2)}xx`)).toBeNull();
    expect(verifyUnsubscribeToken("niente")).toBeNull();
    process.env.UNSUBSCRIBE_SECRET = "z".repeat(40);
    expect(verifyUnsubscribeToken(t)).toBeNull();
  });

  it("nessun dato personale nel token", () => {
    const decoded = Buffer.from(unsubscribeToken(c, p).split(".")[0] ?? "", "base64url").toString();
    expect(JSON.parse(decoded)).toEqual({ c, p });
  });
});
