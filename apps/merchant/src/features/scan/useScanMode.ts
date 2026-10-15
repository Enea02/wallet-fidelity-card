import type { ScanMode } from "@loyalty/shared/logging/events";
import { useCallback, useEffect, useState } from "react";
import { Platform } from "react-native";
import { prefs } from "@/lib/auth/supabase";
import { log } from "@/lib/diagnostics/logger";

const KEY = "lw.scanner.modalita";
const MODES: readonly ScanMode[] = ["fotocamera", "lettore", "manuale"];

/** Sul web senza fotocamera disponibile si parte dal lettore esterno (cassa con lettore USB). */
function defaultMode(): ScanMode {
  if (Platform.OS !== "web") return "fotocamera";
  const media = typeof navigator === "undefined" ? undefined : navigator.mediaDevices;
  return typeof media?.getUserMedia === "function" ? "fotocamera" : "lettore";
}

/** Modalità dello scanner, ricordata sul dispositivo; ogni cambio scrive scan.mode.changed. */
export function useScanMode() {
  const [mode, setMode] = useState<ScanMode>(defaultMode);
  useEffect(() => {
    void prefs.getItem(KEY).then((v) => {
      if (v && (MODES as string[]).includes(v)) setMode(v as ScanMode);
    });
  }, []);
  const change = useCallback(
    (to: ScanMode) => {
      if (to === mode) return;
      log.event("scan.mode.changed", { from: mode, to });
      setMode(to);
      void prefs.setItem(KEY, to);
    },
    [mode],
  );
  return [mode, change] as const;
}
