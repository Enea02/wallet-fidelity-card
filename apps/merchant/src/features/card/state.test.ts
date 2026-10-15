import type { CardView } from "@loyalty/shared/api";
import { describe, expect, it } from "vitest";
import { availability, cardReducer, clientSince, initialState, mmss, UNDO_WINDOW_MS, visitsLabel } from "./state";

const card = (over: Partial<CardView> = {}): CardView => ({
  id: "33333333-3333-4333-8333-333333333333",
  shortCode: "DEMA2345",
  name: "Giulia Rossi",
  stamps: 6,
  stampsRequired: 10,
  rewardsAvailable: 0,
  rewardLabel: "Taglio gratis",
  ...over,
});
const start = () => initialState({ card: card(), since: "2026-03-03T10:00:00Z", visits: 16 });
const notice = (code: string) => ({ code, userMessage: "messaggio", supportCode: "ERR-ABCDE" });

describe("scheda cliente", () => {
  it("+1 timbro: pulsanti bloccati durante la richiesta, poi toast e annullamento per 5 minuti", () => {
    let s = cardReducer(start(), { type: "start", action: "stamp" });
    expect(availability(s, 0, true)).toMatchObject({ stamp: false, redeem: false, undo: false });

    s = cardReducer(s, { type: "stamped", card: card({ stamps: 7 }), rewardUnlocked: false, at: 1000 });
    expect(s.toast).toEqual({ title: "Timbro aggiunto", body: "Giulia ha 7 timbri su 10" });
    expect(s.data.visits).toBe(17);
    // doppio tocco: per 1 secondo dopo il timbro "+1" resta bloccato
    expect(availability(s, 1300, true)).toMatchObject({ stamp: false, undo: true });
    expect(availability(s, 2000, true)).toMatchObject({ stamp: true, undo: true, undoSecondsLeft: 299 });
    expect(availability(s, 1000 + UNDO_WINDOW_MS, true)).toMatchObject({ undo: false, stamp: true });
  });

  it("ultimo timbro: schermata del premio invece del toast; riscatto con conferma", () => {
    let s = cardReducer(start(), {
      type: "stamped",
      card: card({ stamps: 0, rewardsAvailable: 1 }),
      rewardUnlocked: true,
      at: 0,
    });
    expect(s.celebration).toBe(true);
    expect(s.toast).toBeNull();
    expect(availability(s, 0, true).redeem).toBe(true);

    s = cardReducer(s, { type: "askRedeem" });
    expect(s).toMatchObject({ confirmRedeem: true, celebration: false });
    s = cardReducer(s, { type: "start", action: "redeem" });
    s = cardReducer(s, { type: "redeemed", card: card({ stamps: 0, rewardsAvailable: 0 }) });
    expect(s.toast?.title).toBe("Premio riscattato");
    expect(availability(s, 0, true)).toMatchObject({ redeem: false, undo: false });
  });

  it("riscatta disattivato senza premi", () => {
    expect(availability(start(), 0, true).redeem).toBe(false);
  });

  it("cooldown: foglio con il messaggio del server, nessun timbro", () => {
    let s = cardReducer(start(), { type: "start", action: "stamp" });
    s = cardReducer(s, { type: "cooldown", notice: notice("E_STAMP_COOLDOWN") });
    expect(s.cooldown?.code).toBe("E_STAMP_COOLDOWN");
    expect(s.data.card.stamps).toBe(6);
    expect(cardReducer(s, { type: "closeSheets" }).cooldown).toBeNull();
  });

  it("annullamento: saldo e visite tornano indietro, finestra chiusa", () => {
    let s = cardReducer(start(), { type: "stamped", card: card({ stamps: 7 }), rewardUnlocked: false, at: 0 });
    s = cardReducer(s, { type: "undone", card: card({ stamps: 6 }) });
    expect(s.data).toMatchObject({ visits: 16, card: { stamps: 6 } });
    expect(s.undoUntil).toBeNull();
  });

  it("errore: messaggio con codice, l'annullamento si chiude solo se il server lo dice", () => {
    let s = cardReducer(start(), { type: "stamped", card: card({ stamps: 7 }), rewardUnlocked: false, at: 0 });
    s = cardReducer(s, { type: "failed", notice: notice("E_NETWORK") });
    expect(s.error?.code).toBe("E_NETWORK");
    expect(s.undoUntil).not.toBeNull();
    s = cardReducer(s, { type: "failed", notice: notice("E_UNDO_EXPIRED"), closeUndo: true });
    expect(s.undoUntil).toBeNull();
  });

  it("offline: tutte le azioni bloccate", () => {
    const s = cardReducer(start(), {
      type: "stamped",
      card: card({ rewardsAvailable: 1 }),
      rewardUnlocked: false,
      at: 0,
    });
    expect(availability(s, 0, false)).toMatchObject({ stamp: false, redeem: false, undo: false });
  });

  it("testi della scheda", () => {
    expect(clientSince("2026-03-03T10:00:00Z", new Date("2026-10-14T10:00:00Z"))).toBe("Cliente da marzo");
    expect(clientSince("2025-11-03T10:00:00Z", new Date("2026-10-14T10:00:00Z"))).toBe("Cliente da novembre 2025");
    expect([visitsLabel(1), visitsLabel(17)]).toEqual(["1 visita", "17 visite"]);
    expect([mmss(300), mmss(292), mmss(9)]).toEqual(["5:00", "4:52", "0:09"]);
  });
});
