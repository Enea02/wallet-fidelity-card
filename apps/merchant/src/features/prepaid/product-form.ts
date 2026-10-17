/** Modulo del tipo di tessera (area titolare, Fase 9.5): stessi limiti del contratto PrepaidProductCreateBody. */

export interface Draft {
  name: string;
  units: string;
  unitSingular: string;
  unitPlural: string;
  validityMonths: number | null;
}

export const EMPTY_DRAFT: Draft = { name: "", units: "", unitSingular: "", unitPlural: "", validityMonths: null };

export function draftProblems(d: Draft): Partial<Record<keyof Draft, string>> {
  const e: Partial<Record<keyof Draft, string>> = {};
  if (d.name.trim().length < 2 || d.name.trim().length > 40) e.name = "Nome da 2 a 40 caratteri.";
  const n = Number(d.units);
  if (!Number.isInteger(n) || n < 1 || n > 10000) e.units = "Un numero da 1 a 10000.";
  if (d.unitSingular.trim().length < 2) e.unitSingular = "Ad esempio «pagina».";
  if (d.unitPlural.trim().length < 2) e.unitPlural = "Ad esempio «pagine».";
  return e;
}
