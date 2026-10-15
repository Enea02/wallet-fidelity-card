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

export type CardStage = "nuova" | "a metà" | "premio";

export const cardStage = (stamps: number, rewards: number): CardStage =>
  rewards > 0 ? "premio" : stamps === 0 ? "nuova" : "a metà";

export interface CardModuleInput {
  stampsRequired: number;
  stamps: number;
  rewards: number;
  stampUnit: string;
  stampUnitPlural: string;
  rewardLabel: string;
}

/** "1 taglio" · "4 tagli". */
export const unitCount = (o: Pick<CardModuleInput, "stampUnit" | "stampUnitPlural">, k: number) =>
  k === 1 ? `1 ${o.stampUnit}` : `${k} ${o.stampUnitPlural}`;

/**
 * Modulo di testo della carta nel Wallet (docs/design/Carte Wallet, "Testi della carta"):
 * "Come funziona" (nuova), "Ti manca 1 taglio" / "Ti mancano 4 tagli" (a metà),
 * "Taglio gratis disponibile!" (premio). Lo usano la carta vera e l'anteprima dell'app.
 */
export function cardModule(o: CardModuleInput): { header: string; body: string } {
  const rl = lowerFirst(o.rewardLabel);
  const left = o.stampsRequired - o.stamps;
  const oneStampEach = `Un timbro per ogni ${o.stampUnit}.`;
  switch (cardStage(o.stamps, o.rewards)) {
    case "premio":
      return {
        header: `${o.rewardLabel} disponibile!`,
        body: `Hai completato la carta. Mostra il QR alla cassa e goditi ${rl}.`,
      };
    case "nuova":
      return {
        header: "Come funziona",
        body: `${oneStampEach} Al ${o.stampsRequired}° timbro, ${rl}. Mostra il QR alla cassa: niente app, niente carta da perdere.`,
      };
    default:
      return {
        header: `Ti ${left === 1 ? "manca" : "mancano"} ${unitCount(o, left)}`,
        body: `Ancora ${unitCount(o, left)} per il premio: ${rl}. ${oneStampEach}`,
      };
  }
}
