import type { PrepaidView } from "@loyalty/shared/api";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import type { Shop } from "@/lib/session";
import { feedback } from "../card/feedback";
import { createActionKeys, type PrepaidActionKind } from "../card/keys";
import { prepaidAvailability } from "./state";

/** Annullamento non più possibile: il pulsante sparisce (lo dice il server). */
const UNDO_CLOSED = new Set(["E_UNDO_EXPIRED", "E_UNDO_OTHER_OPERATOR", "E_UNDO_NOT_LAST", "E_NOTHING_TO_UNDO"]);

export interface PrepaidNotice {
  code: string;
  userMessage: string;
  supportCode: string;
}

/**
 * Azioni sulla tessera prepagata (Fase 9.5), come useCardActions per la carta fedeltà: un tocco =
 * una richiesta con la sua chiave di idempotenza (riusata se la rete non risponde), pulsanti
 * bloccati durante la richiesta, feedback aptico e sonoro.
 */
export function usePrepaidActions(shop: Shop, initial: PrepaidView, sound: boolean, online: boolean) {
  const [prepaid, setPrepaid] = useState(initial);
  const [busy, setBusy] = useState<PrepaidActionKind | null>(null);
  const [error, setError] = useState<PrepaidNotice | null>(null);
  const [toast, setToast] = useState<{ title: string; body: string } | null>(null);
  const [lastConsumeAt, setLastConsumeAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const keys = useRef(createActionKeys<PrepaidActionKind>()).current;

  // conto alla rovescia di "Annulla ultimo scalo"
  useEffect(() => {
    if (lastConsumeAt === null) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [lastConsumeAt]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(timer);
  }, [toast]);

  const run = useCallback(
    async (kind: PrepaidActionKind, request: (key: string) => Promise<{ prepaid: PrepaidView }>) => {
      setBusy(kind);
      setError(null);
      try {
        const r = await request(keys.key(kind));
        keys.settle(kind);
        setPrepaid(r.prepaid);
        return r.prepaid;
      } catch (e) {
        if (!(e instanceof ApiError)) throw e;
        // senza risposta dal server lo stesso tocco, ripetuto, riusa la stessa chiave
        if (e.code !== "E_NETWORK") keys.settle(kind);
        feedback("error", sound);
        setError({
          code: e.code,
          userMessage: e.userMessage,
          supportCode: e.code === "E_OFFLINE" ? "" : e.supportCode,
        });
        if (UNDO_CLOSED.has(e.code)) setLastConsumeAt(null);
        return null;
      } finally {
        setBusy(null);
      }
    },
    [keys, sound],
  );

  const cardId = prepaid.id;

  const activate = useCallback(async () => {
    const p = await run("activate", (idempotencyKey) =>
      api.call("prepaidActivate", { shopId: shop.id, body: { cardId }, idempotencyKey }),
    );
    if (p) {
      feedback("reward", sound);
      setToast({ title: "Tessera attivata", body: `${p.balance} ${p.unitPlural} disponibili.` });
    }
  }, [run, shop.id, cardId, sound]);

  const consume = useCallback(
    async (quantity: number) => {
      const p = await run("consume", (idempotencyKey) =>
        api.call("prepaidConsume", { shopId: shop.id, body: { cardId, quantity }, idempotencyKey }),
      );
      if (p) {
        feedback("stamp", sound);
        const at = Date.now();
        setLastConsumeAt(at);
        setNow(at);
        setToast({
          title: `Scalate ${quantity} ${quantity === 1 ? p.unitSingular : p.unitPlural}`,
          body: `Restano ${p.balance} ${p.balance === 1 ? p.unitSingular : p.unitPlural}.`,
        });
      }
    },
    [run, shop.id, cardId, sound],
  );

  const recharge = useCallback(async () => {
    const p = await run("recharge", (idempotencyKey) =>
      api.call("prepaidRecharge", { shopId: shop.id, body: { cardId }, idempotencyKey }),
    );
    if (p) {
      feedback("reward", sound);
      setLastConsumeAt(null);
      setToast({ title: "Tessera ricaricata", body: `Ora ${p.balance} ${p.unitPlural}.` });
    }
  }, [run, shop.id, cardId, sound]);

  const undo = useCallback(async () => {
    const p = await run("prepaid_undo", (idempotencyKey) =>
      api.call("prepaidUndo", { shopId: shop.id, body: { cardId }, idempotencyKey }),
    );
    if (p) {
      setLastConsumeAt(null);
      setToast({ title: "Scalo annullato", body: `Saldo tornato a ${p.balance}.` });
    }
  }, [run, shop.id, cardId]);

  return {
    prepaid,
    busy,
    error,
    toast,
    can: prepaidAvailability(prepaid, { online, busy: busy !== null, lastConsumeAt, now }),
    activate,
    consume,
    recharge,
    undo,
    dismissError: () => setError(null),
  };
}
