import { describe, expect, it } from "vitest";
import { destinationFor, hasAnyAccess, nextAfterPassword, parseDest, safeReturnUrl } from "./access-rules";

const solo = { team: false, shops: 1 };
const team = { team: true, shops: 0 };
const entrambi = { team: true, shops: 2 };
const nessuno = { team: false, shops: 0 };

describe("login unico: dopo la password", () => {
  it("chi non è né nel team né nello staff non ha accesso", () => {
    expect(hasAnyAccess(nessuno)).toBe(false);
    expect(hasAnyAccess(solo)).toBe(true);
    expect(hasAnyAccess(team)).toBe(true);
  });

  it("il team passa sempre dal secondo fattore, lo staff entra subito nell'app", () => {
    expect(nextAfterPassword(team, true)).toBe("codice");
    expect(nextAfterPassword(entrambi, false)).toBe("collega");
    expect(nextAfterPassword(solo, false)).toBe("app");
  });
});

describe("login unico: destinazione", () => {
  it("chi ha un solo accesso va lì", () => {
    expect(destinationFor(solo, null)).toEqual({ kind: "go", destination: "app", how: "unico accesso" });
    expect(destinationFor(team, null)).toEqual({ kind: "go", destination: "interno", how: "unico accesso" });
  });

  it("team e staff: schermata di scelta, salvo la pagina che stava aprendo", () => {
    expect(destinationFor(entrambi, null)).toEqual({ kind: "scegli" });
    expect(destinationFor(entrambi, "interno")).toEqual({
      kind: "go",
      destination: "interno",
      how: "pagina richiesta",
    });
    expect(destinationFor(entrambi, "app")).toEqual({ kind: "go", destination: "app", how: "pagina richiesta" });
  });

  it("una pagina richiesta senza diritto non vale: si va dove si può", () => {
    expect(destinationFor(solo, "interno")).toEqual({ kind: "go", destination: "app", how: "unico accesso" });
    expect(destinationFor(team, "app")).toEqual({ kind: "go", destination: "interno", how: "unico accesso" });
  });

  it("?dest= accetta solo interno e app", () => {
    expect(parseDest("interno")).toBe("interno");
    expect(parseDest("app")).toBe("app");
    expect(parseDest("https://evil.example")).toBeNull();
    expect(parseDest(undefined)).toBeNull();
  });
});

describe("login unico: indirizzo di ritorno", () => {
  const opts = { siteOrigin: "https://carte.esempio.it", extraOrigins: ["http://localhost:8081"], appPath: "/app" };

  it("accetta le pagine della web app esercente sul sito (come percorso relativo)", () => {
    expect(safeReturnUrl("https://carte.esempio.it/app/clienti?id=1", opts)).toBe("/app/clienti?id=1");
    expect(safeReturnUrl("/app", opts)).toBe("/app");
  });

  it("accetta le altre origini ammesse (sviluppo con ricarica a caldo)", () => {
    expect(safeReturnUrl("http://localhost:8081/scanner", opts)).toBe("http://localhost:8081/scanner");
  });

  it("rifiuta siti di terzi, altre pagine del sito e schemi strani", () => {
    expect(safeReturnUrl("https://evil.example/app", opts)).toBeNull();
    expect(safeReturnUrl("//evil.example/app", opts)).toBeNull();
    expect(safeReturnUrl("https://carte.esempio.it/interno", opts)).toBeNull();
    expect(safeReturnUrl("https://carte.esempio.it/apple-bar", opts)).toBeNull();
    expect(safeReturnUrl("javascript:alert(1)", opts)).toBeNull();
    expect(safeReturnUrl(42, opts)).toBeNull();
  });
});
