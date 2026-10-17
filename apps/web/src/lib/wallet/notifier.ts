import "server-only";
import type { Shop } from "../types";
import { levelUpMessage, rewardUnlockedMessage } from "./card-texts";
import { deferWalletWork } from "./defer";
import { syncPrepaidCard, syncPrepaidClass, syncShopPrepaidClasses } from "./prepaid-sync";
import { sendCardMessage, syncCard, syncClass } from "./sync";

/*
 * Unico punto in cui il dominio parla con i wallet. Il lavoro parte dopo la risposta all'app
 * (deferWalletWork): un errore di un wallet non annulla mai il timbro, viene registrato e ritentato.
 * Anche le tessere prepagate (Fase 9.5) passano da qui. Apple Wallet si aggiunge qui in Fase 12.
 */

export interface CardChange {
  kind: "enroll" | "stamp" | "redeem" | "undo" | "adjust" | "delete" | "points";
  /** Per il timbro che completa la carta: id dello stamp_event, usato come id della notifica. */
  rewardUnlockedBy?: number | undefined;
  /** Carta a punti salita di livello (Fase 9.6): id del points_event, usato come id della notifica. */
  levelUp?: { eventId: number; level: string; perk: string } | undefined;
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
    if (synced && change.levelUp) {
      const msg = levelUpMessage(shop, change.levelUp.level, change.levelUp.perk);
      await sendCardMessage(
        customerId,
        { id: `level-${change.levelUp.eventId}`, header: msg.header, body: msg.body, kind: "nuovo livello" },
        { track: true },
      );
    }
  });
}

/** Dopo un cambio di impostazioni visibile sulla carta: template subito, carte dalla riconciliazione. */
export function notifyShopChanged(shop: Shop): Promise<void> {
  return deferWalletWork("aggiornamento template", async () => {
    if (shop.loyalty_enabled) await syncClass(shop.id);
    // colore, logo e nome del negozio sono anche sulle tessere prepagate
    await syncShopPrepaidClasses(shop);
  });
}

/** Tessera prepagata cambiata (attivazione, scalo, ricarica, correzione, cancellazione). */
export function notifyPrepaidChanged(cardId: string): Promise<void> {
  return deferWalletWork("sincronizzazione tessera", () => syncPrepaidCard(cardId, { origin: "change" }));
}

/** Tipo di tessera cambiato (nome, unità): template subito, tessere dalla riconciliazione. */
export function notifyPrepaidProductChanged(productId: string): Promise<void> {
  return deferWalletWork("aggiornamento template tessera", () => syncPrepaidClass(productId));
}
