import { describe, expect, it } from "vitest";
import { hasProblems, minCentsOf, pointsChanges, pointsProblems, toPointsDraft, type PointsDraft } from "./points";

const saved = toPointsDraft({
  loyaltyMode: "timbri",
  pointsPerEuro: 1,
  pointsMinCents: 0,
  pointsLevels: [
    { name: "Silver", min: 0, perk: "" },
    { name: "Gold", min: 500, perk: "-5%" },
  ],
});

describe("impostazioni della carta a punti (Fase 9.6)", () => {
  it("dal salvato al modulo", () => {
    expect(saved.minEuro).toBe("");
    expect(saved.levels[1]).toEqual({ name: "Gold", min: "500", perk: "-5%" });
    expect(
      toPointsDraft({ ...{ loyaltyMode: "punti", pointsPerEuro: 2, pointsLevels: [] }, pointsMinCents: 450 }).minEuro,
    ).toBe("4,50");
  });

  it("spesa minima in euro", () => {
    expect(minCentsOf("")).toBe(0);
    expect(minCentsOf("5")).toBe(500);
    expect(minCentsOf("4,50")).toBe(450);
    expect(minCentsOf("1000")).toBe(100_000);
    expect(minCentsOf("1000,01")).toBeNull();
    expect(minCentsOf("x")).toBeNull();
  });

  it("livelli: primo da 0, soglie crescenti, nomi diversi", () => {
    expect(hasProblems(pointsProblems(saved))).toBe(false);
    const bad = (levels: PointsDraft["levels"]) => pointsProblems({ ...saved, levels }).level;
    expect(bad([{ name: "Base", min: "10", perk: "" }])[0]).toMatch(/0 punti/);
    expect(
      bad([
        { name: "Base", min: "0", perk: "" },
        { name: "Oro", min: "0", perk: "" },
      ])[1],
    ).toMatch(/più punti/);
    expect(
      bad([
        { name: "Base", min: "0", perk: "" },
        { name: "base", min: "10", perk: "" },
      ])[1],
    ).toMatch(/stesso nome/);
    expect(pointsProblems({ ...saved, levels: [] }).levels).toBeDefined();
  });

  it("solo i campi cambiati", () => {
    expect(pointsChanges(saved, saved)).toEqual({});
    const d = { ...saved, mode: "punti" as const, minEuro: "5", levels: [{ name: "Silver", min: "0", perk: "caffè" }] };
    expect(pointsChanges(saved, d)).toEqual({
      loyaltyMode: "punti",
      pointsMinCents: 500,
      pointsLevels: [{ name: "Silver", min: 0, perk: "caffè" }],
    });
  });
});
