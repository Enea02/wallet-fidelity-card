import "server-only";
import type { Shop } from "../types";
import { rewardUnlockedMessage } from "./card-texts";
import { deferWalletWork } from "./defer";
import { sendCardMessage, syncCard, syncClass } from "./sync";

/*
 * Unico punto in cui il dominio parla con i wallet. Il lavoro parte dopo la risposta all'app
 * (deferWalletWork): un errore di un wallet non annulla mai il timbro, viene registrato e ritentato.
 * Apple Wallet si aggiunge qui in Fase 12.
 */

export interface CardChange {
  kind: "enroll" | "stamp" | "redeem" | "undo" | "adjust" | "delete";
  /** Per il timbro che completa la carta: id dello stamp_event, usato come id della notifica. */
  rewardUnlockedBy?: number | undefined;
}

export function notifyCardChanged(shop: Shop, customerId: string, change: CardChange): Promise<void> {
  return deferWalletWork("sincronizzazione carta", async () => {
    const synced = await syncCard(customerId, { origin: change.kind === "delete" ? "delete" : "change" });
    if (synced && change.rewardUnlockedBy !== undefined) {
      const msg = rewardUnlockedMessage(shop);
      await sendCardMessage(
        customerId,
        { id: `reward-${change.rewardUnlockedBy}`, header: msg.header, body: msg.body, kind: "premio sbloccato" },
        { track: true },
      );
    }
  });
}

/** Dopo un cambio di impostazioni visibile sulla carta: template subito, carte dalla riconciliazione. */
export function notifyShopChanged(shop: Shop): Promise<void> {
  return deferWalletWork("aggiornamento template", () => syncClass(shop.id));
}
