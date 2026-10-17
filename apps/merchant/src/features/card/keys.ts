import { uuid } from "@/lib/uuid";

export type CardActionKind = "stamp" | "undo" | "redeem";
/** Azioni sulla tessera prepagata (Fase 9.5): stessa regola delle chiavi. */
export type PrepaidActionKind = "activate" | "consume" | "recharge" | "prepaid_undo";

/**
 * Chiavi di idempotenza delle azioni sul saldo, una per tocco.
 * Se il server non ha risposto (rete), ripetere lo stesso tocco riusa la stessa chiave: se la
 * prima richiesta era arrivata, il server non agisce una seconda volta. Dopo una risposta
 * (riuscita o rifiutata) il tocco successivo è un'azione nuova, con una chiave nuova.
 */
export function createActionKeys<K extends string = CardActionKind>(make: () => string = uuid) {
  const pending = new Map<string, string>();
  const id = (kind: K, variant = "") => `${kind}${variant}`;
  return {
    key(kind: K, variant = ""): string {
      const k = id(kind, variant);
      const existing = pending.get(k);
      if (existing) return existing;
      const fresh = make();
      pending.set(k, fresh);
      return fresh;
    },
    /** Il server ha risposto: il prossimo tocco è un'altra azione. */
    settle(kind: K, variant = "") {
      pending.delete(id(kind, variant));
    },
  };
}
