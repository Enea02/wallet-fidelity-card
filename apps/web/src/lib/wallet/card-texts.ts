import type { Customer, Shop } from "../types";

/*
 * Testi della carta nel Wallet, dal design (docs/design/Carte Wallet.dc.html, "Testi della carta").
 * Tre stati: nuova (0 timbri), a metà, premio disponibile. Singolare/plurale dell'unità del negozio:
 * "Ti manca 1 taglio" · "Ti mancano 4 tagli".
 * Rispetto al design: niente "area personale" (il brief la esclude) e regolamento generato
 * dalle impostazioni reali del negozio, senza scadenze non previste.
 */

const lowerFirst = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);

export const unitCount = (shop: Pick<Shop, "stamp_unit" | "stamp_unit_plural">, k: number) =>
  k === 1 ? `1 ${shop.stamp_unit}` : `${k} ${shop.stamp_unit_plural}`;

/** 60 → "1 ora", 240 → "4 ore", 90 → "90 minuti". */
export function cooldownText(minutes: number): string {
  if (minutes % 60 === 0) return minutes === 60 ? "1 ora" : `${minutes / 60} ore`;
  return minutes === 1 ? "1 minuto" : `${minutes} minuti`;
}

export type CardStage = "nuova" | "a metà" | "premio";

export function cardStage(customer: Pick<Customer, "stamps" | "rewards_available">): CardStage {
  if (customer.rewards_available > 0) return "premio";
  return customer.stamps === 0 ? "nuova" : "a metà";
}

export interface CardTexts {
  stamps: string;
  rewards: string;
  module: { header: string; body: string };
  howItWorks: string;
  rules: string;
  privacy: string;
}

export function cardTexts(shop: Shop, customer: Pick<Customer, "stamps" | "rewards_available">): CardTexts {
  const n = shop.stamps_required;
  const reward = shop.reward_label;
  const rl = lowerFirst(reward);
  const left = n - customer.stamps;
  const oneStampEach = `Un timbro per ogni ${shop.stamp_unit}.`;
  const howItWorks = `${oneStampEach} Al ${n}° timbro, ${rl}.`;

  const stateModule =
    cardStage(customer) === "premio"
      ? { header: `${reward} disponibile!`, body: `Hai completato la carta. Mostra il QR alla cassa e goditi ${rl}.` }
      : cardStage(customer) === "nuova"
        ? {
            header: "Come funziona",
            body: `${howItWorks} Mostra il QR alla cassa: niente app, niente carta da perdere.`,
          }
        : {
            header: `Ti ${left === 1 ? "manca" : "mancano"} ${unitCount(shop, left)}`,
            body: `Ancora ${unitCount(shop, left)} per il premio: ${rl}. ${oneStampEach}`,
          };

  const rules = [
    shop.stamp_cooldown_minutes > 0
      ? `• Un timbro per ${shop.stamp_unit}, al massimo uno ogni ${cooldownText(shop.stamp_cooldown_minutes)}.`
      : `• Un timbro per ${shop.stamp_unit}.`,
    "• Non cumulabile con altre promozioni, non convertibile in denaro.",
  ].join("\n");

  const holder = shop.legal_name ?? shop.name;
  const privacy = shop.privacy_email
    ? `Dati trattati da ${holder}. Per esercitare i tuoi diritti scrivi a ${shop.privacy_email}.`
    : `Dati trattati da ${holder}. Per esercitare i tuoi diritti chiedi in negozio.`;

  return {
    stamps: `${customer.stamps} / ${n}`,
    rewards: customer.rewards_available > 0 ? `${customer.rewards_available} · ${reward}` : "0",
    module: stateModule,
    howItWorks,
    rules,
    privacy,
  };
}

/** Notifica del premio sbloccato (design, "Retro Apple e notifiche"). */
export const rewardUnlockedMessage = (shop: Shop) => ({
  header: shop.name,
  body: `Premio sbloccato! ${shop.reward_label} al prossimo passaggio: mostra la carta alla cassa.`,
});
