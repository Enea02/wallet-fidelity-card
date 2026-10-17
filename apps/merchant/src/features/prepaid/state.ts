import type { PrepaidView } from "@loyalty/shared/api";
import { prepaidDate, prepaidModule, prepaidUnits } from "@loyalty/shared/copy";

/*
 * Scheda della tessera prepagata in cassa (Fase 9.5): cosa si può fare in ogni stato.
 * Da attivare → solo "Attiva (pagamento ricevuto)". Attiva → scala (fino al saldo) o ricarica.
 * Esaurita o scaduta → ricarica. "Annulla ultimo scalo" per 5 minuti dopo uno scalo fatto qui.
 */

export const UNDO_WINDOW_MS = 5 * 60 * 1000;

export interface PrepaidAvailability {
  activate: boolean;
  consume: boolean;
  /** Massimo scalabile ora (0 se non si può scalare). */
  maxQuantity: number;
  recharge: boolean;
  undo: boolean;
  /** Secondi rimasti per annullare (0 = non annullabile). */
  undoSecondsLeft: number;
}

export function prepaidAvailability(
  p: Pick<PrepaidView, "state" | "balance">,
  opts: { online: boolean; busy: boolean; lastConsumeAt: number | null; now: number },
): PrepaidAvailability {
  const ready = opts.online && !opts.busy;
  const undoLeft =
    opts.lastConsumeAt === null ? 0 : Math.max(0, Math.ceil((opts.lastConsumeAt + UNDO_WINDOW_MS - opts.now) / 1000));
  return {
    activate: ready && p.state === "da_attivare",
    consume: ready && p.state === "attiva" && p.balance > 0,
    maxQuantity: p.state === "attiva" ? p.balance : 0,
    recharge: ready && p.state !== "da_attivare",
    undo: ready && undoLeft > 0,
    undoSecondsLeft: undoLeft,
  };
}

/** Testi della scheda: titolo dello stato, saldo e scadenza, come sulla tessera nel wallet. */
export function prepaidSummary(p: PrepaidView) {
  const module = prepaidModule({
    state: p.state,
    balance: p.balance,
    chargedUnits: p.chargedUnits,
    units: p.units,
    unitSingular: p.unitSingular,
    unitPlural: p.unitPlural,
    expiresAt: p.expiresAt,
  });
  const STATE = { da_attivare: "Da attivare", attiva: "Attiva", esaurita: "Esaurita", scaduta: "Scaduta" } as const;
  return {
    badge: STATE[p.state],
    title: module.header,
    balance: p.state === "da_attivare" ? null : `${p.balance} / ${Math.max(p.chargedUnits, p.balance)}`,
    expiry: p.expiresAt
      ? `${p.state === "scaduta" ? "Scaduta il" : "Valida fino al"} ${prepaidDate(p.expiresAt)}`
      : null,
    rechargeLabel: `+${prepaidUnits(p, p.units)}`,
  };
}

export const unitsText = (p: Pick<PrepaidView, "unitSingular" | "unitPlural">, n: number) => prepaidUnits(p, n);
