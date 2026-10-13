import "server-only";
import type { CardState } from "../types";
import { notifyLoyaltyObject, patchLoyaltyObject } from "./google";
import { notifyApple } from "./apple";

export interface CardChange {
  kind: "stamp" | "redeem";
  rewardUnlocked: boolean;
}

/**
 * Unico punto in cui il dominio parla con i wallet.
 * Aggiungere un wallet = aggiungere un ramo qui, il resto non cambia.
 * Gli errori dei wallet non annullano il timbro: vengono solo loggati.
 */
export async function notifyCardChanged(state: CardState, change: CardChange) {
  const jobs: Array<Promise<unknown>> = [
    patchLoyaltyObject(state).then(() =>
      change.rewardUnlocked
        ? notifyLoyaltyObject(
            state.customer.id,
            `${state.shop.reward_label}!`,
            `Hai raggiunto ${state.shop.stamps_required} timbri da ${state.shop.name}. Il premio ti aspetta.`,
          )
        : undefined,
    ),
    notifyApple(state),
  ];

  const results = await Promise.allSettled(jobs);
  for (const r of results) {
    if (r.status === "rejected") console.error("[wallet] aggiornamento fallito:", r.reason);
  }
}
