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

/* ---------- tessere prepagate (Fase 9.5) ---------- */

export type PrepaidCopyState = "da_attivare" | "attiva" | "esaurita" | "scaduta";

export interface PrepaidModuleInput {
  /** "abbonamento": membership con vantaggio e scadenza, senza unità (Fase 9.6). */
  kind?: "consumo" | "abbonamento";
  benefit?: string | null;
  state: PrepaidCopyState;
  balance: number;
  /** Saldo dopo l'ultima attivazione o ricarica ("138 di 150"). */
  chargedUnits: number;
  /** Unità di una tessera nuova o di una ricarica. */
  units: number;
  unitSingular: string;
  unitPlural: string;
  /** ISO; null = senza scadenza. */
  expiresAt: string | null;
}

const day = new Intl.DateTimeFormat("it-IT", {
  timeZone: "Europe/Rome",
  day: "numeric",
  month: "numeric",
  year: "numeric",
});
/** "03/11/2027" */
export const prepaidDate = (iso: string) => day.format(new Date(iso));

/** "1 pagina" · "12 pagine". */
export const prepaidUnits = (o: Pick<PrepaidModuleInput, "unitSingular" | "unitPlural">, k: number) =>
  `${k} ${k === 1 ? o.unitSingular : o.unitPlural}`;

/** Saldo in breve per la carta: "138 / 150". */
export const prepaidBalance = (o: Pick<PrepaidModuleInput, "balance" | "chargedUnits" | "state">) =>
  o.state === "da_attivare" ? "—" : `${o.balance} / ${Math.max(o.chargedUnits, o.balance)}`;

/**
 * Modulo di testo della tessera nel Wallet e nelle anteprime dell'app: da attivare, attiva
 * ("Ti restano 138 pagine"), esaurita, scaduta. Il pagamento è sempre in negozio.
 */
export function prepaidModule(o: PrepaidModuleInput): { header: string; body: string } {
  if (o.kind === "abbonamento") return membershipModule(o);
  const until = o.expiresAt ? `, valida fino al ${prepaidDate(o.expiresAt)}` : "";
  switch (o.state) {
    case "da_attivare":
      return {
        header: "Da attivare in negozio",
        body: `Paga la tessera in cassa: la attiviamo subito e qui trovi le tue ${prepaidUnits(o, o.units)}.`,
      };
    case "esaurita":
      return {
        header: "Tessera esaurita",
        body: `Ricaricala in negozio: altre ${prepaidUnits(o, o.units)} su questa stessa carta.`,
      };
    case "scaduta":
      return {
        header: "Tessera scaduta",
        body:
          `Scaduta${o.expiresAt ? ` il ${prepaidDate(o.expiresAt)}` : ""} con ${prepaidUnits(o, o.balance)}. ` +
          "Ricaricala in negozio per usarla di nuovo.",
      };
    default:
      return {
        header: `Ti ${o.balance === 1 ? "resta" : "restano"} ${prepaidUnits(o, o.balance)}`,
        body: `Su ${Math.max(o.chargedUnits, o.balance)} caricate${until}. Mostra il QR in cassa a ogni utilizzo.`,
      };
  }
}

/** Abbonamento o membership (Fase 9.6): vantaggio e validità, niente unità. */
function membershipModule(o: PrepaidModuleInput): { header: string; body: string } {
  const benefit = o.benefit ? `Vantaggio: ${o.benefit}.` : "";
  switch (o.state) {
    case "da_attivare":
      return {
        header: "Da attivare in negozio",
        body: `Paga l'abbonamento in cassa: lo attiviamo subito. ${benefit}`.trim(),
      };
    case "scaduta":
      return {
        header: "Abbonamento scaduto",
        body: `Scaduto${o.expiresAt ? ` il ${prepaidDate(o.expiresAt)}` : ""}: rinnovalo in negozio. ${benefit}`.trim(),
      };
    default:
      return {
        header: o.expiresAt ? `Valido fino al ${prepaidDate(o.expiresAt)}` : "Socio attivo",
        body: `${benefit} Mostra il QR in cassa.`.trim(),
      };
  }
}

/* ---------- punti con livelli (Fase 9.6) ---------- */

export interface PointsLevel {
  name: string;
  /** Punti totali da cui si entra nel livello (il primo è 0). */
  min: number;
  /** Vantaggio del livello ("-5% sui trattamenti"), vuoto se non c'è. */
  perk: string;
}

/** Livello attuale, prossimo livello e punti che mancano (sui punti totali, che non si perdono). */
export function levelFor(levels: readonly PointsLevel[], total: number) {
  const sorted = [...levels].sort((a, b) => a.min - b.min);
  const current = [...sorted].reverse().find((l) => l.min <= total) ?? sorted[0]!;
  const next = sorted.find((l) => l.min > total) ?? null;
  return { current, next, toNext: next ? next.min - total : 0 };
}

const pts = (n: number) => (n === 1 ? "1 punto" : `${n} punti`);

/** "1 punto per ogni euro: da 500 punti sei Gold." (pagina di iscrizione e cartello) */
export function pointsTagline(o: { pointsPerEuro: number; levels: readonly PointsLevel[] }): string {
  const second = [...o.levels].sort((a, b) => a.min - b.min)[1];
  const rule = o.pointsPerEuro === 1 ? "1 punto per ogni euro" : `${o.pointsPerEuro} punti per ogni euro`;
  return second ? `${rule}: da ${second.min} punti sei ${second.name}.` : `${rule} speso.`;
}

/** Modulo di testo della carta a punti nel wallet e nelle anteprime: livello, punti, prossimo livello, vantaggio. */
export function pointsModule(o: { points: number; total: number; levels: readonly PointsLevel[] }): {
  header: string;
  body: string;
} {
  const { current, next, toNext } = levelFor(o.levels, o.total);
  const perk = current.perk ? ` Vantaggio ${current.name}: ${current.perk}.` : "";
  return {
    header: `Sei ${current.name} · ${pts(o.points)}`,
    body: next
      ? `Ancora ${pts(toNext)} per diventare ${next.name}.${perk}`
      : `Hai raggiunto il livello più alto.${perk}`,
  };
}
