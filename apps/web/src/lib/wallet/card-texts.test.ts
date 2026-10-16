import { describe, expect, it } from "vitest";
import type { Shop } from "../types";
import { cardStage, cardTexts, cooldownText, rewardUnlockedMessage, unitCount } from "./card-texts";

const shop: Shop = {
  id: "s1",
  slug: "salone-nora",
  name: "Salone Nora",
  stamps_required: 10,
  reward_label: "Taglio gratis",
  logo_url: null,
  hex_color: "#5b1f2e",
  stamp_cooldown_minutes: 240,
  status: "active",
  program_name: "Carta Amica",
  stamp_unit: "taglio",
  stamp_unit_plural: "tagli",
  card_version: 1,
  legal_name: "Nora Bianchi",
  vat_number: null,
  privacy_email: "privacy@salonenora.it",
  tagline: null,
  stamp_icon: "scissors",
  loyalty_enabled: true,
};

describe("testi della carta (design: Testi della carta)", () => {
  it("carta nuova: Come funziona", () => {
    const t = cardTexts(shop, { stamps: 0, rewards_available: 0 });
    expect(t.stamps).toBe("0 / 10");
    expect(t.rewards).toBe("0");
    expect(t.module).toEqual({
      header: "Come funziona",
      body: "Un timbro per ogni taglio. Al 10° timbro, taglio gratis. Mostra il QR alla cassa: niente app, niente carta da perdere.",
    });
  });

  it("a metà: singolare e plurale dell'unità", () => {
    expect(cardTexts(shop, { stamps: 6, rewards_available: 0 }).module).toEqual({
      header: "Ti mancano 4 tagli",
      body: "Ancora 4 tagli per il premio: taglio gratis. Un timbro per ogni taglio.",
    });
    expect(cardTexts(shop, { stamps: 9, rewards_available: 0 }).module.header).toBe("Ti manca 1 taglio");
  });

  it("premio sbloccato", () => {
    const t = cardTexts(shop, { stamps: 0, rewards_available: 1 });
    expect(t.rewards).toBe("1 · Taglio gratis");
    expect(t.module).toEqual({
      header: "Taglio gratis disponibile!",
      body: "Hai completato la carta. Mostra il QR alla cassa e goditi taglio gratis.",
    });
    expect(cardStage({ stamps: 3, rewards_available: 2 })).toBe("premio");
  });

  it("regolamento dalle impostazioni reali, niente area personale né scadenze inventate", () => {
    const t = cardTexts(shop, { stamps: 0, rewards_available: 0 });
    expect(t.rules).toBe(
      "• Un timbro per taglio, al massimo uno ogni 4 ore.\n• Non cumulabile con altre promozioni, non convertibile in denaro.",
    );
    expect(cardTexts({ ...shop, stamp_cooldown_minutes: 0 }, { stamps: 0, rewards_available: 0 }).rules).toMatch(
      /^• Un timbro per taglio\.\n/,
    );
    expect(t.privacy).toBe(
      "Dati trattati da Nora Bianchi. Per esercitare i tuoi diritti scrivi a privacy@salonenora.it.",
    );
    const all = JSON.stringify(t).toLowerCase();
    for (const banned of ["area personale", "90 giorni", "12 mesi"]) expect(all).not.toContain(banned);
  });

  it("utilità", () => {
    expect(unitCount(shop, 1)).toBe("1 taglio");
    expect(unitCount(shop, 3)).toBe("3 tagli");
    expect([60, 240, 90, 1].map(cooldownText)).toEqual(["1 ora", "4 ore", "90 minuti", "1 minuto"]);
    expect(rewardUnlockedMessage(shop).body).toBe(
      "Premio sbloccato! Taglio gratis al prossimo passaggio: mostra la carta alla cassa.",
    );
  });
});
