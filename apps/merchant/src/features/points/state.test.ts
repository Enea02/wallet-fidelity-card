import { describe, expect, it } from "vitest";
import { levelLine, parseEuro, pointsFor, preview, undoSecondsLeft, UNDO_WINDOW_MS } from "./state";

const card = { pointsPerEuro: 1, minCents: 0 };

describe("carta a punti in cassa (Fase 9.6)", () => {
  it("importi in euro con virgola o punto", () => {
    expect(parseEuro("23,50")).toBe(2350);
    expect(parseEuro("23.5")).toBe(2350);
    expect(parseEuro(" 7 € ")).toBe(700);
    expect(parseEuro("0")).toBeNull();
    expect(parseEuro("10000")).toBe(1_000_000);
    expect(parseEuro("10000,01")).toBeNull();
    expect(parseEuro("12,345")).toBeNull();
    expect(parseEuro("abc")).toBeNull();
  });

  it("punti per difetto e spesa minima, come il server", () => {
    expect(pointsFor(2399, card)).toBe(23);
    expect(pointsFor(2350, { pointsPerEuro: 2, minCents: 0 })).toBe(47);
    expect(pointsFor(499, { pointsPerEuro: 1, minCents: 500 })).toBe(0);
    expect(pointsFor(500, { pointsPerEuro: 1, minCents: 500 })).toBe(5);
  });

  it("anteprima", () => {
    expect(preview("23,50", card).hint).toBe("+23 punti");
    expect(preview("1", card).hint).toBe("+1 punto");
    expect(preview("0,50", card).hint).toBe("Importo troppo basso per un punto.");
    expect(preview("4", { pointsPerEuro: 1, minCents: 500 }).hint).toBe(
      "Sotto la spesa minima di 5,00 €: nessun punto.",
    );
    expect(preview("", card).cents).toBeNull();
  });

  it("livello e finestra di annullamento", () => {
    expect(levelLine({ level: "Gold", nextLevel: "Platinum", toNext: 120 })).toBe(
      "Gold · ancora 120 punti per Platinum",
    );
    expect(levelLine({ level: "Platinum", nextLevel: null, toNext: 0 })).toBe("Platinum · livello più alto");
    expect(undoSecondsLeft(null, 0)).toBe(0);
    expect(undoSecondsLeft(1000, 1000)).toBe(UNDO_WINDOW_MS / 1000);
    expect(undoSecondsLeft(1000, 1000 + UNDO_WINDOW_MS)).toBe(0);
  });
});
