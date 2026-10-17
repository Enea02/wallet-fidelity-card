import type { ScanMode } from "@loyalty/shared/logging/events";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { log } from "@/lib/diagnostics/logger";
import { useShop } from "@/lib/session";
import type { Notice } from "../card/state";
import { feedback } from "../card/feedback";
import { createDedupe, parseCode } from "./parse";
import { scannedFor, setScanned, setScannedPoints, setScannedPrepaid } from "./session";

let lastCode: string | null = null;

/**
 * Lettura dallo scanner → carta: scarta ciò che non è una carta (senza chiamare il server),
 * ignora le letture ripetute, cerca la carta e apre la scheda cliente.
 */
export function useScan(mode: ScanMode, sound: boolean) {
  const shop = useShop();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<(Notice & { title: string }) | null>(null);
  const dedupe = useRef(createDedupe());
  const busyRef = useRef(false);
  const lastFailed = useRef("");

  // tornando dallo scanner la carta appena servita non si riapre (il telefono del cliente è ancora lì)
  useFocusEffect(
    useCallback(() => {
      if (lastCode) dedupe.current.hold(lastCode);
    }, []),
  );

  const handle = useCallback(
    async (raw: string) => {
      if (busyRef.current) return;
      const p = parseCode(raw);
      if (!p.ok) {
        if (!dedupe.current.accept(raw.trim())) return;
        lastFailed.current = raw.trim();
        log.event("scan.read.invalid", { mode, reason: p.reason });
        feedback("error", sound);
        setNotice({
          code: "lettura",
          title: "Non è una carta",
          userMessage:
            mode === "manuale"
              ? "Il codice breve ha 8 caratteri (lettere e numeri, senza 0, O, 1, I, L)."
              : "Questo codice non è il QR di una carta fedeltà. Chiedi al cliente di aprire la carta nel wallet.",
          supportCode: "",
        });
        return;
      }
      if (!dedupe.current.accept(p.code)) return;
      log.event("scan.read.ok", { mode, kind: p.kind });
      busyRef.current = true;
      setBusy(true);
      setNotice(null);
      const scannedAt = Date.now();
      try {
        const r = await api.call("lookup", { shopId: shop.id, body: { code: p.code } });
        lastCode = p.code;
        if (r.kind === "tessera") {
          // tessera prepagata (Fase 9.5): scheda con attivazione, scalo e ricarica
          setScannedPrepaid({ prepaid: r.prepaid, mode, scannedAt });
          router.push({ pathname: "/tessera/[id]", params: { id: r.prepaid.id } });
        } else if (r.kind === "punti") {
          // carta a punti (Fase 9.6): scheda con importo dello scontrino e livello
          setScannedPoints({ card: r.card, since: r.since, mode, scannedAt });
          router.push({ pathname: "/punti/[id]", params: { id: r.card.id } });
        } else {
          setScanned({ data: r, mode, scannedAt });
          router.push({ pathname: "/cliente/[id]", params: { id: r.card.id } });
        }
      } catch (e) {
        if (!(e instanceof ApiError)) throw e;
        lastFailed.current = p.code;
        feedback("error", sound);
        setNotice({
          code: e.code,
          title:
            e.code === "E_QR_OTHER_SHOP" || e.code === "E_CARD_NOT_FOUND" ? "QR non valido" : "Carta non disponibile",
          userMessage:
            e.code === "E_QR_OTHER_SHOP"
              ? `Non è una carta di ${shop.name}. Chiedi al cliente di aprire quella giusta.`
              : e.userMessage,
          supportCode: e.code === "E_QR_OTHER_SHOP" || e.code === "E_OFFLINE" ? "" : e.supportCode,
        });
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [mode, shop.id, shop.name, sound],
  );

  /**
   * "Ok, riprova": con la fotocamera la stessa carta resta ignorata per 3 secondi (il QR sbagliato
   * è ancora inquadrato e riaprirebbe subito l'avviso); con lettore e codice a mano si può ripetere subito.
   */
  const dismiss = useCallback(() => {
    setNotice(null);
    if (mode === "fotocamera") dedupe.current.hold(lastFailed.current);
    else dedupe.current.reset();
  }, [mode]);

  return { handle, busy, notice, dismiss };
}

/** La scheda appena aperta da una lettura: per scan.card.shown e i tempi del timbro. */
export { scannedFor };
