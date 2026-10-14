import "server-only";
import { log } from "../observability/logger";
import type { CardState } from "../types";
import { googleEnabled, notifyLoyaltyObject, patchLoyaltyObject } from "./google";
import { notifyApple } from "./apple";

export interface CardChange {
  kind: "stamp" | "redeem" | "undo" | "adjust";
  rewardUnlocked: boolean;
}

/**
 * Unico punto in cui il dominio parla con i wallet.
 * Aggiungere un wallet = aggiungere un ramo qui, il resto non cambia.
 * Gli errori dei wallet non annullano il timbro: vengono loggati (wallet.update.failed).
 */
export async function notifyCardChanged(state: CardState, change: CardChange) {
  const jobs: Array<{ provider: "google" | "apple"; run: Promise<unknown> }> = [
    { provider: "apple", run: notifyApple(state) },
  ];
  if (googleEnabled()) {
    jobs.push({
      provider: "google",
      run: patchLoyaltyObject(state).then(() =>
        change.rewardUnlocked
          ? notifyLoyaltyObject(
              state.customer.id,
              `${state.shop.reward_label}!`,
              `Hai raggiunto ${state.shop.stamps_required} timbri da ${state.shop.name}. Il premio ti aspetta.`,
            )
          : undefined,
      ),
    });
  }

  await Promise.all(
    jobs.map(({ provider, run }) =>
      run.catch((e: unknown) =>
        log.event(
          "wallet.update.failed",
          { provider, customer_ref: state.customer.id, error_message: e instanceof Error ? e.message : String(e) },
          { error: e },
        ),
      ),
    ),
  );
}
