import { describe, expect, it } from "vitest";
import {
  isRequestId,
  newRequestId,
  normalizeSupportCode,
  requestIdCandidatesFromSupportCode,
  requestIdTime,
  supportCodeFromRequestId,
} from "./request-id";

describe("request_id", () => {
  it("è un ULID valido, ordinabile per tempo, con l'istante corretto", () => {
    const t = Date.UTC(2026, 10, 3, 9, 32, 14, 512);
    const a = newRequestId(t);
    const b = newRequestId(t + 1);
    expect(isRequestId(a)).toBe(true);
    expect(a < b).toBe(true);
    expect(requestIdTime(a)).toBe(t);
    expect(new Set(Array.from({ length: 1000 }, () => newRequestId(t))).size).toBe(1000);
  });

  it("rifiuta valori che non sono ULID", () => {
    for (const v of [
      "",
      "abc",
      "01JB7K3QX",
      "01jb7k3qxzzzzzzzzzzzzzzzzz",
      "01JB7K3QXUUUUUUUUUUUUUUUUU",
      "x".repeat(26),
    ]) {
      expect(isRequestId(v)).toBe(false);
    }
  });
});

describe("codice assistenza", () => {
  it("è ERR- seguito dai caratteri 5-9 del request_id (esempio del brief)", () => {
    expect(supportCodeFromRequestId("01JB7K3QX0ABCDEFGHJKMNPQRS")).toBe("ERR-7K3QX");
  });

  it("accetta come lo scrive una persona al telefono", () => {
    expect(normalizeSupportCode("err-7k3qx")).toBe("ERR-7K3QX");
    expect(normalizeSupportCode(" 7K3QX ")).toBe("ERR-7K3QX");
    expect(normalizeSupportCode("ERR7KOQX")).toBe("ERR-7K0QX");
    expect(normalizeSupportCode("ERR-7K3Q")).toBeNull();
  });

  it("la funzione inversa ritrova il request_id negli ultimi 30 giorni", () => {
    const now = Date.UTC(2026, 10, 30, 12);
    for (const daysAgo of [0, 1, 7, 13, 29]) {
      const rid = newRequestId(now - daysAgo * 86_400_000 - 12_345);
      const candidates = requestIdCandidatesFromSupportCode(supportCodeFromRequestId(rid), { to: new Date(now) });
      expect(candidates.length).toBeGreaterThanOrEqual(1);
      expect(candidates.length).toBeLessThanOrEqual(4);
      const hit = candidates.find((c) => rid.startsWith(c.prefix));
      expect(hit).toBeDefined();
      expect(hit!.from.getTime()).toBeLessThanOrEqual(requestIdTime(rid));
      expect(hit!.to.getTime()).toBeGreaterThanOrEqual(requestIdTime(rid));
    }
  });

  it("un codice malformato non produce candidati", () => {
    expect(requestIdCandidatesFromSupportCode("ciao")).toEqual([]);
  });
});
