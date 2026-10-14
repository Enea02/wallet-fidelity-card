import NetInfo from "@react-native-community/netinfo";
import { useSyncExternalStore } from "react";
import { Platform } from "react-native";
import { log } from "./diagnostics/logger";

/*
 * Stato della rete: "Sei offline" e blocco delle azioni che richiedono il server.
 * Si guarda solo la connessione del dispositivo: niente ping di
 * raggiungibilità verso servizi terzi. Se il server non risponde lo dice il client API (E_NETWORK).
 */
NetInfo.configure({ reachabilityShouldRun: () => false });

let online = true;
let offlineSince: number | null = null;
const listeners = new Set<() => void>();

function update(next: boolean) {
  if (next === online) return;
  online = next;
  if (!next) {
    offlineSince = Date.now();
    log.event("app.offline", {});
  } else {
    const s = offlineSince === null ? 0 : Math.round((Date.now() - offlineSince) / 1000);
    offlineSince = null;
    log.event("app.online", { offline_s: s });
  }
  for (const l of listeners) l();
}

let started = false;
export function startNetworkWatch() {
  if (started) return;
  started = true;
  if (Platform.OS === "web") {
    // sul web gli eventi standard online/offline (NetInfo in Chrome ascolta solo navigator.connection)
    if (typeof window === "undefined") return;
    update(navigator.onLine);
    window.addEventListener("online", () => update(true));
    window.addEventListener("offline", () => update(false));
    return;
  }
  NetInfo.addEventListener((state) => update(state.isConnected !== false));
}

export const isOnline = () => online;

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export const useOnline = () => useSyncExternalStore(subscribe, isOnline, isOnline);
