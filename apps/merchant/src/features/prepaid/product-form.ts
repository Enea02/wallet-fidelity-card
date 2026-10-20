/**
 * Modulo del tipo di tessera (area titolare): stessi limiti del contratto PrepaidProductCreateBody.
 * A consumo (Fase 9.5): unità per tessera e ricarica. Abbonamento (Fase 9.6): vantaggio e durata.
 */

export interface Draft {
  kind: "consumo" | "abbonamento";
  name: string;
  benefit: string;
  units: string;
  unitSingular: string;
  unitPlural: string;
  validityMonths: number | null;
}

export const EMPTY_DRAFT: Draft = {
  kind: "consumo",
  name: "",
  benefit: "",
  units: "",
  unitSingular: "",
  unitPlural: "",
  validityMonths: null,
};

export function draftProblems(d: Draft): Partial<Record<keyof Draft, string>> {
  const e: Partial<Record<keyof Draft, string>> = {};
  if (d.name.trim().length < 2 || d.name.trim().length > 40) e.name = "Nome da 2 a 40 caratteri.";
  if (d.kind === "abbonamento") {
    const b = d.benefit.trim().length;
    if (b < 2 || b > 80) e.benefit = "Ad esempio «accesso illimitato» o «-10% su tutto» (2-80 caratteri).";
    return e;
  }
  const n = Number(d.units);
  if (!Number.isInteger(n) || n < 1 || n > 10000) e.units = "Un numero da 1 a 10000.";
  if (d.unitSingular.trim().length < 2) e.unitSingular = "Ad esempio «pagina».";
  if (d.unitPlural.trim().length < 2) e.unitPlural = "Ad esempio «pagine».";
  return e;
}

/** Corpo della richiesta di creazione (o di modifica, senza il tipo, che non cambia). */
export function draftBody(d: Draft) {
  const common = { name: d.name.trim(), validityMonths: d.validityMonths };
  return d.kind === "abbonamento"
    ? { kind: "abbonamento" as const, ...common, benefit: d.benefit.trim() }
    : {
        kind: "consumo" as const,
        ...common,
        units: Number(d.units),
        unitSingular: d.unitSingular.trim(),
        unitPlural: d.unitPlural.trim(),
      };
}
