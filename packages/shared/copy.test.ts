import { describe, expect, it } from "vitest";
import { levelFor, pointsModule, pointsTagline, prepaidBalance, prepaidModule, taglineFor } from "./copy";

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

describe("punti con livelli e abbonamenti", () => {
  const levels = [
    { name: "Silver", min: 0, perk: "" },
    { name: "Gold", min: 500, perk: "-5% sui trattamenti" },
    { name: "Platinum", min: 1500, perk: "" },
  ];
  it("livello sui punti totali, prossimo livello e punti mancanti", () => {
    expect(levelFor(levels, 0)).toMatchObject({ current: { name: "Silver" }, next: { name: "Gold" }, toNext: 500 });
    expect(levelFor(levels, 512)).toMatchObject({ current: { name: "Gold" }, toNext: 988 });
    expect(levelFor(levels, 2000)).toMatchObject({ current: { name: "Platinum" }, next: null, toNext: 0 });
  });
  it("testi della carta a punti", () => {
    expect(pointsModule({ points: 512, total: 512, levels })).toEqual({
      header: "Sei Gold · 512 punti",
      body: "Ancora 988 punti per diventare Platinum. Vantaggio Gold: -5% sui trattamenti.",
    });
    expect(pointsModule({ points: 1, total: 1600, levels }).body).toBe("Hai raggiunto il livello più alto.");
    expect(pointsTagline({ pointsPerEuro: 1, levels })).toBe("1 punto per ogni euro: da 500 punti sei Gold.");
  });
  it("abbonamento: da attivare, valido, senza scadenza, scaduto", () => {
    const base = {
      kind: "abbonamento" as const,
      benefit: "-10% su tutto",
      balance: 0,
      chargedUnits: 0,
      units: 0,
      unitSingular: "",
      unitPlural: "",
    };
    expect(prepaidModule({ ...base, state: "da_attivare", expiresAt: null }).body).toContain(
      "Vantaggio: -10% su tutto.",
    );
    expect(prepaidModule({ ...base, state: "attiva", expiresAt: "2027-10-17T10:00:00Z" }).header).toBe(
      "Valido fino al 17/10/2027",
    );
    expect(prepaidModule({ ...base, state: "attiva", expiresAt: null }).header).toBe("Socio attivo");
    expect(prepaidModule({ ...base, state: "scaduta", expiresAt: "2026-10-01T10:00:00Z" }).header).toBe(
      "Abbonamento scaduto",
    );
  });
});
