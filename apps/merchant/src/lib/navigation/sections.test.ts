import { describe, expect, it } from "vitest";
import { canSee, homeFor, sectionOf, sectionsFor, isWide } from "./sections";

describe("sezioni per ruolo", () => {
  it("l'operatore vede solo scanner e profilo", () => {
    expect(sectionsFor("operator").map((s) => s.key)).toEqual(["scanner", "profilo"]);
    for (const k of ["panoramica", "clienti", "carta", "staff", "messaggi"] as const)
      expect(canSee("operator", k)).toBe(false);
    expect(homeFor("operator")).toBe("scanner");
  });

  it("il titolare vede le 5 sezioni del design nelle tab, più scanner e profilo", () => {
    const s = sectionsFor("owner");
    expect(s.filter((x) => x.inTabs).map((x) => x.label)).toEqual([
      "Panoramica",
      "Clienti",
      "Carta",
      "Staff",
      "Messaggi",
    ]);
    expect(canSee("owner", "scanner")).toBe(true);
    expect(canSee("owner", "profilo")).toBe(true);
    expect(homeFor("owner")).toBe("panoramica");
  });

  it("riconosce la sezione dal percorso", () => {
    expect(sectionOf("/clienti")).toBe("clienti");
    expect(sectionOf("/staff/123")).toBe("staff");
    expect(sectionOf("/clienti/33333333-3333-4333-8333-333333333333")).toBe("clienti");
    expect(sectionOf("/cartello")).toBe("cartello");
    expect(sectionOf("/accedi")).toBeNull();
    expect(sectionOf("/")).toBeNull();
  });

  it("barra laterale da 900 px in su", () => {
    expect(isWide(390)).toBe(false);
    expect(isWide(899)).toBe(false);
    expect(isWide(1024)).toBe(true);
  });
});
