import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { log } from "@/lib/diagnostics/logger";
import type { Shop } from "@/lib/session";
import type { ScannedCard } from "../scan/session";
import { feedback } from "./feedback";
import { createActionKeys, type CardActionKind } from "./keys";
import { availability, cardReducer, initialState, STAMP_GUARD_MS, type Notice } from "./state";

/** Annullamento non più possibile: il pulsante sparisce (lo dice il server). */
const UNDO_CLOSED = new Set([
  "E_UNDO_EXPIRED",
  "E_UNDO_OTHER_OPERATOR",
  "E_UNDO_NOT_LAST",
  "E_UNDO_REWARD_REDEEMED",
  "E_NOTHING_TO_UNDO",
]);

const noticeOf = (e: ApiError): Notice => ({
  code: e.code,
  userMessage: e.userMessage,
  supportCode: e.code === "E_OFFLINE" ? "" : e.supportCode,
});

/**
 * Azioni della scheda cliente: un tocco = una richiesta con la sua chiave di idempotenza
 * (riusata se la rete non risponde), pulsanti bloccati durante la richiesta, feedback aptico
 * e sonoro, tempi nei log (scan.stamp.confirmed).
 */
export function useCardActions(shop: Shop, scanned: ScannedCard, sound: boolean, online: boolean) {
  const [state, dispatch] = useReducer(cardReducer, scanned.data, initialState);
  const keys = useRef(createActionKeys()).current;
  const [now, setNow] = useState(() => Date.now());
  const customerId = scanned.data.card.id;

  // "+1" si riattiva da solo dopo il blocco anti doppio tocco
  useEffect(() => {
    if (state.lastStampAt === null) return;
    const left = state.lastStampAt + STAMP_GUARD_MS - Date.now();
    if (left <= 0) return;
    const timer = setTimeout(() => setNow(Date.now()), left + 20);
    return () => clearTimeout(timer);
  }, [state.lastStampAt]);

  // conto alla rovescia di "Annulla ultimo timbro"
  useEffect(() => {
    if (state.undoUntil === null) return;
    const timer = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (state.undoUntil !== null && t >= state.undoUntil) dispatch({ type: "undoExpired" });
    }, 1000);
    return () => clearInterval(timer);
  }, [state.undoUntil]);

  // il toast verde sparisce dopo 2,5 secondi
  useEffect(() => {
    if (!state.toast) return;
    const timer = setTimeout(() => dispatch({ type: "hideToast" }), 2500);
    return () => clearTimeout(timer);
  }, [state.toast]);

  const call = useCallback(
    async <T>(kind: CardActionKind, variant: string, request: (key: string) => Promise<T>): Promise<T | ApiError> => {
      dispatch({ type: "start", action: kind });
      try {
        const out = await request(keys.key(kind, variant));
        keys.settle(kind, variant);
        return out;
      } catch (e) {
        if (!(e instanceof ApiError)) throw e;
        // senza risposta dal server lo stesso tocco, ripetuto, riusa la stessa chiave
        if (e.code !== "E_NETWORK") keys.settle(kind, variant);
        feedback("error", sound);
        return e;
      }
    },
    [keys, sound],
  );

  const stamp = useCallback(
    async (force = false) => {
      const tapped = Date.now();
      const r = await call("stamp", force ? "forzato" : "", (idempotencyKey) =>
        api.call("stamp", {
          shopId: shop.id,
          body: { customerId, ...(force && { force: true as const }) },
          idempotencyKey,
        }),
      );
      if (r instanceof ApiError) {
        dispatch(
          r.code === "E_STAMP_COOLDOWN"
            ? { type: "cooldown", notice: noticeOf(r) }
            : { type: "failed", notice: noticeOf(r) },
        );
        return;
      }
      const at = Date.now();
      setNow(at);
      dispatch({ type: "stamped", card: r.card, rewardUnlocked: r.rewardUnlocked, at });
      feedback(r.rewardUnlocked ? "reward" : "stamp", sound);
      log.event("scan.stamp.confirmed", {
        customer_ref: r.card.shortCode,
        duration_ms: at - tapped,
        since_scan_ms: at - scanned.scannedAt,
      });
    },
    [call, customerId, scanned.scannedAt, shop.id, sound],
  );

  const undo = useCallback(async () => {
    const r = await call("undo", "", (idempotencyKey) =>
      api.call("undo", { shopId: shop.id, body: { customerId }, idempotencyKey }),
    );
    if (r instanceof ApiError) {
      dispatch({ type: "failed", notice: noticeOf(r), closeUndo: UNDO_CLOSED.has(r.code) });
      return;
    }
    dispatch({ type: "undone", card: r.card });
  }, [call, customerId, shop.id]);

  const redeem = useCallback(async () => {
    const r = await call("redeem", "", (idempotencyKey) =>
      api.call("redeem", { shopId: shop.id, body: { customerId }, idempotencyKey }),
    );
    if (r instanceof ApiError) {
      dispatch({ type: "failed", notice: noticeOf(r) });
      return;
    }
    dispatch({ type: "redeemed", card: r.card });
    feedback("stamp", sound);
  }, [call, customerId, shop.id, sound]);

  return {
    state,
    can: availability(state, now, online),
    stamp,
    undo,
    redeem,
    askRedeem: () => dispatch({ type: "askRedeem" }),
    closeSheets: () => dispatch({ type: "closeSheets" }),
    dismissError: () => dispatch({ type: "clearError" }),
  };
}
