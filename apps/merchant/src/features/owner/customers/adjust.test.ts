import { describe, expect, it } from "vitest";
import { adjustReason, adjustSummary } from "./adjust";

describe("rettifica del saldo", () => {
  it("motivo obbligatorio: rapido, oppure almeno 5 caratteri scritti", () => {
    expect(adjustReason("Timbro dimenticato", "")).toBe("Timbro dimenticato");
    expect(adjustReason("Errore dello staff", "Sara ha timbrato due volte")).toBe(
      "Errore dello staff: Sara ha timbrato due volte",
    );
    expect(adjustReason("Altro", "boh")).toBeNull();
    expect(adjustReason("Altro", "Taglio del 10/10 senza telefono")).toBe("Taglio del 10/10 senza telefono");
    expect(adjustReason(null, "")).toBeNull();
  });

  it("riepilogo della modifica", () => {
    expect(adjustSummary(6, 7, 0, 0)).toBe("+1 timbro");
    expect(adjustSummary(6, 4, 0, 1)).toBe("−2 timbri, +1 premio");
    expect(adjustSummary(3, 3, 1, 1)).toBe("nessuna modifica");
  });
});
