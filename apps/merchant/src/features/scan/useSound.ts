import { useCallback, useEffect, useState } from "react";
import { prefs } from "@/lib/auth/supabase";

const KEY = "lw.scanner.suono";

/** Suono di conferma sul web: spento di default, ricordato sul dispositivo. */
export function useSound() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    void prefs.getItem(KEY).then((v) => setOn(v === "1"));
  }, []);
  const toggle = useCallback(() => {
    setOn((v) => {
      void prefs.setItem(KEY, v ? "0" : "1");
      return !v;
    });
  }, []);
  return [on, toggle] as const;
}
