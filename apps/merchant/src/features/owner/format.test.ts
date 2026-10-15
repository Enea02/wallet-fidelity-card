import { describe, expect, it } from "vitest";
import {
  ago,
  greeting,
  historyLine,
  nextPromoAllowed,
  plural,
  shortDate,
  weekDelta,
  weekRange,
  type HistoryInput,
} from "./format";

const now = new Date("2026-10-14T10:00:00Z");
const h = (over: Partial<HistoryInput>): HistoryInput => ({
  at: "2026-10-10T08:12:00Z",
  action: "stamp",
  actorName: "Sara",
  before: null,
  after: null,
  reason: null,
  ...over,
});

describe("testi dell'area titolare", () => {
  it("date in italiano, anno solo se diverso", () => {
    expect(shortDate("2026-08-12T10:00:00Z", now)).toBe("12 ago");
    expect(shortDate("2025-08-12T10:00:00Z", now)).toBe("12 ago 2025");
    expect(weekRange("2026-10-05")).toBe("5–11 ottobre");
    expect(weekRange("2026-09-28")).toBe("28 settembre – 4 ottobre");
  });

  it("variazione sulla settimana scorsa e plurali", () => {
    expect(weekDelta(92, 81)).toBe("+11 sulla settimana scorsa");
    expect(weekDelta(70, 74)).toBe("−4 sulla settimana scorsa");
    expect(weekDelta(5, 5)).toBe("uguale alla settimana scorsa");
    expect([plural(1, "cliente", "clienti"), plural(3, "cliente", "clienti")]).toEqual(["1 cliente", "3 clienti"]);
    expect([greeting(9), greeting(15), greeting(20)]).toEqual(["Buongiorno", "Buon pomeriggio", "Buonasera"]);
  });

  it("storico come nel design T3", () => {
    expect(historyLine(h({}), "Taglio gratis", now)).toEqual({
      what: "Timbro",
      meta: "10 ott · 10:12 · Sara",
      delta: "+1",
    });
    expect(
      historyLine(
        h({
          action: "adjust",
          actorName: "Nora",
          reason: "Timbro dimenticato",
          before: { stamps: 6, rewards_available: 0 },
          after: { stamps: 7, rewards_available: 0 },
        }),
        "Taglio gratis",
        now,
      ),
    ).toMatchObject({ what: "Correzione · Timbro dimenticato", delta: "+1 timbro" });
    expect(historyLine(h({ action: "redeem" }), "Taglio gratis", now).what).toBe("Premio riscattato · Taglio gratis");
    expect(historyLine(h({ action: "enroll", actorName: "cliente" }), "x", now)).toMatchObject({
      what: "Iscrizione",
      meta: "10 ott · 10:12 · dalla pagina del negozio",
    });
    expect(historyLine(h({ after: { forced: true } }), "x", now).what).toBe("Timbro · forzato durante il cooldown");
    expect(historyLine(h({ action: "marketing_consent", after: { consent_marketing: false } }), "x", now).what).toBe(
      "Consenso alle promozioni revocato",
    );
  });

  it("tempi relativi e limite settimanale delle promozioni", () => {
    expect(ago("2026-10-14T08:00:00Z", now)).toBe("oggi");
    expect(ago("2026-10-13T08:00:00Z", now)).toBe("ieri");
    expect(ago("2026-10-12T08:00:00Z", now)).toBe("2 giorni fa");
    expect(ago("2026-09-20T08:00:00Z", now)).toBe("3 settimane fa");
    expect(nextPromoAllowed(null, now)).toBeNull();
    expect(nextPromoAllowed("2026-10-10T10:00:00Z", now)?.toISOString()).toBe("2026-10-17T10:00:00.000Z");
    expect(nextPromoAllowed("2026-10-01T10:00:00Z", now)).toBeNull();
  });
});
