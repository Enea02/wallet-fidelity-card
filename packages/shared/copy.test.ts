import { describe, expect, it } from "vitest";
import { taglineFor } from "./copy";

describe("frase d'apertura", () => {
  it("quella del titolare, altrimenti automatica", () => {
    const base = { stampsRequired: 10, stampUnitPlural: "tagli", rewardLabel: "Taglio gratis" };
    expect(taglineFor({ ...base, tagline: null })).toBe("Ogni 10 tagli, taglio gratis.");
    expect(taglineFor({ ...base, tagline: "Ogni 10 pieghe, una è nostra." })).toBe("Ogni 10 pieghe, una è nostra.");
  });
});
