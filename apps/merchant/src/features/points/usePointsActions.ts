import type { PointsView } from "@loyalty/shared/api";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import type { Shop } from "@/lib/session";
import { feedback } from "../card/feedback";
import { createActionKeys, type PointsActionKind } from "../card/keys";
import { pts, undoSecondsLeft } from "./state";

/** Annullamento non più possibile: il pulsante sparisce (lo dice il server). */
const UNDO_CLOSED = new Set(["E_UNDO_EXPIRED", "E_UNDO_OTHER_OPERATOR", "E_UNDO_NOT_LAST", "E_NOTHING_TO_UNDO"]);

export interface PointsNotice {
  code: string;
  userMessage: string;
  supportCode: string;
}

/**
 * Azioni sulla carta a punti (Fase 9.6), come useCardActions: un tocco = una richiesta con la sua
 * chiave di idempotenza (riusata se la rete non risponde), pulsanti bloccati durante la richiesta.
 */
export function usePointsActions(shop: Shop, initial: PointsView, sound: boolean, online: boolean) {
  const [card, setCard] = useState(initial);
  const [busy, setBusy] = useState<PointsActionKind | null>(null);
  const [error, setError] = useState<PointsNotice | null>(null);
  const [toast, setToast] = useState<{ title: string; body: string } | null>(null);
  const [lastAddAt, setLastAddAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const keys = useRef(createActionKeys<PointsActionKind>()).current;

  useEffect(() => {
    if (lastAddAt === null) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [lastAddAt]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(timer);
  }, [toast]);

  const run = useCallback(
    async (
      kind: PointsActionKind,
      request: (key: string) => Promise<{ card: PointsView; pointsAdded: number; levelChanged: boolean }>,
    ) => {
      setBusy(kind);
      setError(null);
      try {
        const r = await request(keys.key(kind));
        keys.settle(kind);
        setCard(r.card);
        return r;
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
        if (UNDO_CLOSED.has(e.code)) setLastAddAt(null);
        return null;
      } finally {
        setBusy(null);
      }
    },
    [keys, sound],
  );

  const customerId = card.id;

  const add = useCallback(
    async (amountCents: number) => {
      const r = await run("points_add", (idempotencyKey) =>
        api.call("pointsAdd", { shopId: shop.id, body: { customerId, amountCents }, idempotencyKey }),
      );
      if (!r) return false;
      feedback(r.levelChanged ? "reward" : "stamp", sound);
      if (r.pointsAdded > 0) {
        const at = Date.now();
        setLastAddAt(at);
        setNow(at);
      }
      setToast(
        r.levelChanged
          ? { title: `Nuovo livello: ${r.card.level}`, body: r.card.perk || `+${pts(r.pointsAdded)}` }
          : { title: `+${pts(r.pointsAdded)}`, body: `Ora ${pts(r.card.points)}.` },
      );
      return true;
    },
    [run, shop.id, customerId, sound],
  );

  const undo = useCallback(async () => {
    const r = await run("points_undo", (idempotencyKey) =>
      api.call("pointsUndo", { shopId: shop.id, body: { customerId }, idempotencyKey }),
    );
    if (r) {
      setLastAddAt(null);
      setToast({ title: "Punti annullati", body: `Saldo tornato a ${pts(r.card.points)}.` });
    }
  }, [run, shop.id, customerId]);

  const left = undoSecondsLeft(lastAddAt, now);
  return {
    card,
    busy,
    error,
    toast,
    can: { add: online && busy === null, undo: online && busy === null && left > 0, undoSecondsLeft: left },
    add,
    undo,
    dismissError: () => setError(null),
  };
}
