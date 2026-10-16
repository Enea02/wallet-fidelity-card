import type { ScanMode } from "@loyalty/shared/logging/events";
import type { PrepaidView } from "@loyalty/shared/api";
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

/** Tessera prepagata appena letta (Fase 9.5): la sua scheda parte da questi dati. */
export interface ScannedPrepaid {
  prepaid: PrepaidView;
  mode: ScanMode;
  scannedAt: number;
}

let currentPrepaid: ScannedPrepaid | null = null;

export const setScannedPrepaid = (s: ScannedPrepaid) => {
  currentPrepaid = s;
};

export const scannedPrepaidFor = (cardId: string): ScannedPrepaid | null =>
  currentPrepaid && currentPrepaid.prepaid.id === cardId ? currentPrepaid : null;
