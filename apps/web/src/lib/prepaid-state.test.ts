import { describe, expect, it } from "vitest";
import { prepaidState } from "./prepaid-state";

describe("stato della tessera prepagata", () => {
  const now = Date.parse("2026-11-03T10:00:00Z");
  it("da attivare finché non è pagata, poi attiva, esaurita a zero, scaduta dopo la scadenza", () => {
    expect(prepaidState({ status: "pending", balance: 0, expires_at: null }, now)).toBe("da_attivare");
    expect(prepaidState({ status: "active", balance: 10, expires_at: null }, now)).toBe("attiva");
    expect(prepaidState({ status: "active", balance: 0, expires_at: null }, now)).toBe("esaurita");
    expect(prepaidState({ status: "active", balance: 10, expires_at: "2026-11-02T10:00:00Z" }, now)).toBe("scaduta");
    expect(prepaidState({ status: "active", balance: 10, expires_at: "2027-11-02T10:00:00Z" }, now)).toBe("attiva");
  });
});
