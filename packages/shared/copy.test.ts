import { describe, expect, it } from "vitest";
import { prepaidBalance, prepaidModule, taglineFor } from "./copy";

describe("frase d'apertura", () => {
  it("quella del titolare, altrimenti automatica", () => {
    const base = { stampsRequired: 10, stampUnitPlural: "tagli", rewardLabel: "Taglio gratis" };
    expect(taglineFor({ ...base, tagline: null })).toBe("Ogni 10 tagli, taglio gratis.");
    expect(taglineFor({ ...base, tagline: "Ogni 10 pieghe, una è nostra." })).toBe("Ogni 10 pieghe, una è nostra.");
  });
});

describe("testi della tessera prepagata", () => {
  const base = {
    balance: 138,
    chargedUnits: 150,
    units: 150,
    unitSingular: "pagina",
    unitPlural: "pagine",
    expiresAt: null,
  };
  it("da attivare, attiva (singolare e plurale), esaurita, scaduta", () => {
    expect(prepaidModule({ ...base, state: "da_attivare", balance: 0, chargedUnits: 0 }).header).toBe(
      "Da attivare in negozio",
    );
    expect(prepaidModule({ ...base, state: "attiva" })).toEqual({
      header: "Ti restano 138 pagine",
      body: "Su 150 caricate. Mostra il QR in cassa a ogni utilizzo.",
    });
    expect(prepaidModule({ ...base, state: "attiva", balance: 1 }).header).toBe("Ti resta 1 pagina");
    expect(prepaidModule({ ...base, state: "attiva", expiresAt: "2027-11-03T10:00:00Z" }).body).toContain(
      "valida fino al 03/11/2027",
    );
    expect(prepaidModule({ ...base, state: "esaurita", balance: 0 }).body).toContain("altre 150 pagine");
    expect(prepaidModule({ ...base, state: "scaduta", balance: 40, expiresAt: "2026-11-01T10:00:00Z" }).body).toBe(
      "Scaduta il 01/11/2026 con 40 pagine. Ricaricala in negozio per usarla di nuovo.",
    );
    expect(prepaidBalance({ ...base, state: "attiva" })).toBe("138 / 150");
    expect(prepaidBalance({ ...base, state: "da_attivare" })).toBe("—");
  });
});
