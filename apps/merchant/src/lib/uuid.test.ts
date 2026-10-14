import { describe, expect, it } from "vitest";
import { uuid } from "./uuid";

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("uuid per le chiavi di idempotenza", () => {
  it("formato v4, sempre diverso", () => {
    const ids = new Set(Array.from({ length: 100 }, uuid));
    expect(ids.size).toBe(100);
    for (const id of ids) expect(id).toMatch(V4);
  });

  it("funziona anche senza crypto (Hermes)", () => {
    const original = globalThis.crypto;
    Object.defineProperty(globalThis, "crypto", { value: undefined, configurable: true });
    try {
      expect(uuid()).toMatch(V4);
    } finally {
      Object.defineProperty(globalThis, "crypto", { value: original, configurable: true });
    }
  });
});
