/**
 * Testi della carta condivisi da web pubblico, PDF del cartello e app esercente.
 */

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** Frase d'apertura: quella scelta dal titolare, altrimenti "Ogni 10 tagli, taglio gratis." */
export const taglineFor = (s: {
  tagline: string | null;
  stampsRequired: number;
  stampUnitPlural: string;
  rewardLabel: string;
}) => s.tagline ?? `Ogni ${s.stampsRequired} ${s.stampUnitPlural}, ${lowerFirst(s.rewardLabel)}.`;
