import type { ScanMode } from "@loyalty/shared/logging/events";
import type { CardData } from "../card/state";

/*
 * Passaggio dallo scanner alla scheda cliente senza rileggere la carta: la scheda prende
 * i dati della lettura appena fatta (e l'istante della lettura, per i tempi nei log).
 */
export interface ScannedCard {
  data: CardData;
  mode: ScanMode;
  /** Istante della lettura (ms): da qui si misura "lettura → timbro confermato". */
  scannedAt: number;
}

let current: ScannedCard | null = null;

export const setScanned = (s: ScannedCard) => {
  current = s;
};

/** La lettura per questa carta, se è quella appena fatta. */
export const scannedFor = (customerId: string): ScannedCard | null =>
  current && current.data.card.id === customerId ? current : null;
