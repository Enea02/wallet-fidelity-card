import { describe, expect, it } from "vitest";
import { cardModule } from "@loyalty/shared/copy";
import { contrastChecks, cooldownLabel, draftChanges, draftErrors, squareCrop, type CardDraft } from "./logic";

const draft: CardDraft = {
  name: "Salone Nora",
  hexColor: "#5B1F2E",
  stampsRequired: 10,
  stampIcon: "scissors",
  rewardLabel: "Taglio gratis",
  tagline: "",
  programName: "Carta Amica",
  stampUnit: "taglio",
  stampUnitPlural: "tagli",
  stampCooldownMinutes: 60,
};

describe("impostazioni carta", () => {
  it("ritaglio quadrato centrato", () => {
    expect(squareCrop(1200, 800)).toEqual({ originX: 200, originY: 0, width: 800, height: 800 });
    expect(squareCrop(600, 900)).toEqual({ originX: 0, originY: 150, width: 600, height: 600 });
  });

  it("contrasto: il bordeaux del design passa tutte le verifiche; il giallo viene corretto", () => {
    const dark = contrastChecks("#5B1F2E");
    expect(dark.corrected).toBe(false);
    expect(dark.checks.every((c) => c.ok)).toBe(true);
    const yellow = contrastChecks("#F7C843");
    expect(yellow.checks.every((c) => c.ok)).toBe(true); // i colori della carta sono già corretti
  });

  it("modulo di testo della carta: stesso testo della carta nel wallet", () => {
    const o = { stampsRequired: 10, stampUnit: "taglio", stampUnitPlural: "tagli", rewardLabel: "Taglio gratis" };
    expect(cardModule({ ...o, stamps: 6, rewards: 0 }).header).toBe("Ti mancano 4 tagli");
    expect(cardModule({ ...o, stamps: 9, rewards: 0 }).header).toBe("Ti manca 1 taglio");
    expect(cardModule({ ...o, stamps: 0, rewards: 0 }).header).toBe("Come funziona");
    expect(cardModule({ ...o, stamps: 0, rewards: 1 }).header).toBe("Taglio gratis disponibile!");
  });

  it("solo i campi cambiati, colore normalizzato, frase vuota = automatica", () => {
    expect(draftChanges(draft, { ...draft })).toEqual({});
    expect(draftChanges(draft, { ...draft, hexColor: "#5b1f2e" })).toEqual({});
    expect(draftChanges(draft, { ...draft, hexColor: "2f4b7c", stampsRequired: 8, tagline: "  " })).toEqual({
      hexColor: "#2F4B7C",
      stampsRequired: 8,
    });
    expect(draftChanges({ ...draft, tagline: "Vecchia" }, { ...draft, tagline: "" })).toEqual({ tagline: null });
  });

  it("errori dei campi e tempi minimi", () => {
    expect(draftErrors(draft)).toEqual({});
    expect(draftErrors({ ...draft, rewardLabel: "x", hexColor: "rosso" })).toMatchObject({
      rewardLabel: expect.stringContaining("da 2 a 40"),
      hexColor: expect.stringContaining("non valido"),
    });
    expect([0, 30, 60, 240, 1440].map(cooldownLabel)).toEqual(["Nessuno", "30 minuti", "1 ora", "4 ore", "1 giorno"]);
  });
});
