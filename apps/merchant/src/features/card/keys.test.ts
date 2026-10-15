import { describe, expect, it } from "vitest";
import { createActionKeys } from "./keys";

describe("chiavi di idempotenza per tocco", () => {
  it("stesso tocco ripetuto dopo un errore di rete: stessa chiave", () => {
    let n = 0;
    const k = createActionKeys(() => `k${++n}`);
    expect(k.key("stamp")).toBe("k1");
    expect(k.key("stamp")).toBe("k1"); // nessuna risposta: il nuovo tentativo riusa la chiave
    k.settle("stamp");
    expect(k.key("stamp")).toBe("k2"); // dopo una risposta è un timbro nuovo
  });

  it("azioni e varianti diverse hanno chiavi diverse", () => {
    let n = 0;
    const k = createActionKeys(() => `k${++n}`);
    expect(k.key("stamp")).toBe("k1");
    expect(k.key("stamp", "forzato")).toBe("k2");
    expect(k.key("redeem")).toBe("k3");
  });
});
