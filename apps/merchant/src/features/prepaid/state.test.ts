import type { PrepaidView } from "@loyalty/shared/api";
import { describe, expect, it } from "vitest";
import { prepaidAvailability, prepaidSummary, UNDO_WINDOW_MS } from "./state";

const view = (over: Partial<PrepaidView> = {}): PrepaidView => ({
  id: "11111111-1111-4111-8111-111111111111",
  shortCode: "K7M2Q9XA",
  name: "Tina",
  productId: "22222222-2222-4222-8222-222222222222",
  productName: "Tessera fotocopie",
  unitSingular: "pagina",
  unitPlural: "pagine",
  units: 150,
  state: "attiva",
  balance: 138,
  chargedUnits: 150,
  activatedAt: "2026-11-01T10:00:00.000Z",
  expiresAt: null,
  ...over,
});
const base = { online: true, busy: false, lastConsumeAt: null, now: 1_000_000 };

describe("scheda della tessera in cassa", () => {
  it("da attivare: solo l'attivazione", () => {
    const a = prepaidAvailability(view({ state: "da_attivare", balance: 0 }), base);
    expect(a).toMatchObject({ activate: true, consume: false, recharge: false, maxQuantity: 0 });
  });
  it("attiva: scalo fino al saldo e ricarica; senza rete niente", () => {
    expect(prepaidAvailability(view(), base)).toMatchObject({
      activate: false,
      consume: true,
      maxQuantity: 138,
      recharge: true,
    });
    expect(prepaidAvailability(view(), { ...base, online: false })).toMatchObject({ consume: false, recharge: false });
  });
  it("esaurita o scaduta: solo ricarica", () => {
    expect(prepaidAvailability(view({ state: "esaurita", balance: 0 }), base)).toMatchObject({
      consume: false,
      recharge: true,
    });
    expect(prepaidAvailability(view({ state: "scaduta" }), base)).toMatchObject({
      consume: false,
      maxQuantity: 0,
      recharge: true,
    });
  });
  it("annulla per 5 minuti dopo uno scalo", () => {
    const at = base.now - 60_000;
    expect(prepaidAvailability(view(), { ...base, lastConsumeAt: at }).undoSecondsLeft).toBe(240);
    expect(prepaidAvailability(view(), { ...base, lastConsumeAt: base.now - UNDO_WINDOW_MS }).undo).toBe(false);
  });
  it("testi: stato, saldo, scadenza e ricarica", () => {
    expect(prepaidSummary(view())).toMatchObject({
      badge: "Attiva",
      title: "Ti restano 138 pagine",
      balance: "138 / 150",
      rechargeLabel: "+150 pagine",
    });
    expect(prepaidSummary(view({ state: "da_attivare", balance: 0, chargedUnits: 0 })).balance).toBeNull();
    expect(prepaidSummary(view({ expiresAt: "2027-11-03T10:00:00Z" })).expiry).toBe("Valida fino al 03/11/2027");
  });
});
