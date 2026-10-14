import type { CardView } from "@loyalty/shared/api";

/*
 * Stato della scheda cliente (design Staff S3-S5): saldo, azione in corso, finestra di
 * annullamento, avvisi. Puro (testato senza React Native); useCardActions lo collega alle API.
 */

export const UNDO_WINDOW_MS = 5 * 60 * 1000;

export interface CardData {
  card: CardView;
  /** Data d'iscrizione (ISO). */
  since: string;
  visits: number;
}

export interface Notice {
  code: string;
  userMessage: string;
  supportCode: string;
}

export interface CardState {
  data: CardData;
  busy: null | "stamp" | "undo" | "redeem";
  /** Fine della finestra per annullare il timbro dato da questo dispositivo (ms), se aperta. */
  undoUntil: number | null;
  toast: { title: string; body: string } | null;
  /** Foglio "Timbro già dato da poco" (messaggio del server con i minuti). */
  cooldown: Notice | null;
  confirmRedeem: boolean;
  celebration: boolean;
  error: Notice | null;
}

export type CardEvent =
  | { type: "start"; action: "stamp" | "undo" | "redeem" }
  | { type: "stamped"; card: CardView; rewardUnlocked: boolean; at: number }
  | { type: "undone"; card: CardView }
  | { type: "redeemed"; card: CardView }
  | { type: "cooldown"; notice: Notice }
  | { type: "failed"; notice: Notice; closeUndo?: boolean }
  | { type: "askRedeem" }
  | { type: "closeSheets" }
  | { type: "hideToast" }
  | { type: "clearError" }
  | { type: "undoExpired" };

export const initialState = (data: CardData): CardState => ({
  data,
  busy: null,
  undoUntil: null,
  toast: null,
  cooldown: null,
  confirmRedeem: false,
  celebration: false,
  error: null,
});

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

/** "1 timbro su 10", "7 timbri su 10". */
export const stampsLabel = (n: number, of: number) => `${n === 1 ? "1 timbro" : `${n} timbri`} su ${of}`;

export function cardReducer(s: CardState, e: CardEvent): CardState {
  switch (e.type) {
    case "start":
      return { ...s, busy: e.action, error: null, cooldown: null, confirmRedeem: false };
    case "stamped":
      return {
        ...s,
        busy: null,
        data: { ...s.data, card: e.card, visits: s.data.visits + 1 },
        undoUntil: e.at + UNDO_WINDOW_MS,
        celebration: e.rewardUnlocked,
        toast: e.rewardUnlocked
          ? null
          : {
              title: "Timbro aggiunto",
              body: `${firstName(e.card.name)} ha ${stampsLabel(e.card.stamps, e.card.stampsRequired)}`,
            },
      };
    case "undone":
      return {
        ...s,
        busy: null,
        data: { ...s.data, card: e.card, visits: Math.max(0, s.data.visits - 1) },
        undoUntil: null,
        celebration: false,
        toast: {
          title: "Timbro annullato",
          body: `${firstName(e.card.name)} ha ${e.card.stamps} timbri su ${e.card.stampsRequired}`,
        },
      };
    case "redeemed":
      return {
        ...s,
        busy: null,
        data: { ...s.data, card: e.card },
        // dopo un riscatto l'ultimo timbro non si annulla più (lo dice anche il server)
        undoUntil: null,
        celebration: false,
        confirmRedeem: false,
        toast: { title: "Premio riscattato", body: `${e.card.rewardLabel} per ${firstName(e.card.name)}` },
      };
    case "cooldown":
      return { ...s, busy: null, cooldown: e.notice };
    case "failed":
      return { ...s, busy: null, error: e.notice, confirmRedeem: false, undoUntil: e.closeUndo ? null : s.undoUntil };
    case "askRedeem":
      return { ...s, confirmRedeem: true, celebration: false, error: null };
    case "closeSheets":
      return { ...s, cooldown: null, confirmRedeem: false, celebration: false };
    case "hideToast":
      return { ...s, toast: null };
    case "clearError":
      return { ...s, error: null };
    case "undoExpired":
      return { ...s, undoUntil: null };
  }
}

/** Cosa si può fare adesso (pulsanti attivi). */
export function availability(s: CardState, now: number, online: boolean) {
  const idle = s.busy === null && online;
  return {
    stamp: idle,
    redeem: idle && s.data.card.rewardsAvailable > 0,
    undo: idle && s.undoUntil !== null && now < s.undoUntil,
    undoSecondsLeft: s.undoUntil === null ? 0 : Math.max(0, Math.ceil((s.undoUntil - now) / 1000)),
  };
}

/** "Cliente da marzo" (anno se non è quello corrente). */
export function clientSince(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const month = d.toLocaleDateString("it-IT", { month: "long", timeZone: "Europe/Rome" });
  return d.getFullYear() === now.getFullYear() ? `Cliente da ${month}` : `Cliente da ${month} ${d.getFullYear()}`;
}

export const visitsLabel = (n: number) => (n === 1 ? "1 visita" : `${n} visite`);

/** "4:52" per il conto alla rovescia dell'annullamento. */
export const mmss = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
