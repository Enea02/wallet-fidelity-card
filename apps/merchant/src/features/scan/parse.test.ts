import { describe, expect, it } from "vitest";
import { createDedupe, parseCode } from "./parse";

describe("codice letto dallo scanner", () => {
  it("QR della carta: 32 caratteri esadecimali (anche maiuscoli dal lettore)", () => {
    expect(parseCode("0123456789abcdef0123456789ABCDEF\n")).toEqual({
      ok: true,
      kind: "QR",
      code: "0123456789abcdef0123456789abcdef",
    });
  });

  it("codice breve: maiuscole, spazi e trattini tollerati", () => {
    expect(parseCode("dema 2345")).toEqual({ ok: true, kind: "codice breve", code: "DEMA2345" });
    expect(parseCode("DEMA-2345")).toMatchObject({ ok: true, code: "DEMA2345" });
  });

  it("scarta il resto con un motivo leggibile, senza riportare il contenuto", () => {
    expect(parseCode("https://esempio.it/promo")).toEqual({ ok: false, reason: "URL di un sito" });
    expect(parseCode("8001234567890")).toEqual({ ok: false, reason: "codice a barre numerico di 13 cifre" });
    expect(parseCode("DEMA234")).toEqual({ ok: false, reason: "testo di 7 caratteri" });
    expect(parseCode("DEMO2345")).toMatchObject({ ok: false }); // la O non esiste nei codici brevi
    expect(parseCode("   ")).toEqual({ ok: false, reason: "lettura vuota" });
  });
});

describe("letture ripetute della fotocamera", () => {
  it("ignora lo stesso codice entro 3 secondi, accetta subito un codice diverso", () => {
    let t = 0;
    const d = createDedupe(3000, () => t);
    expect(d.accept("A")).toBe(true);
    t = 500;
    expect(d.accept("A")).toBe(false);
    expect(d.accept("B")).toBe(true);
    t = 3000;
    expect(d.accept("B")).toBe(false); // 2,5 s dopo la lettura di B
    t = 3600;
    expect(d.accept("B")).toBe(true);
    d.reset();
    expect(d.accept("B")).toBe(true);
  });
});
