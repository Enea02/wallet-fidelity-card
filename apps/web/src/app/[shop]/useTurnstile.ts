"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PublicApiError } from "../_components/public-api";

/*
 * Cloudflare Turnstile (anti-bot prima dell'SMS), in modalità "interaction-only": quasi sempre
 * invisibile, chiede un clic solo se il traffico è sospetto. Token monouso: si azzera dopo ogni invio.
 */

interface TurnstileApi {
  render(el: HTMLElement, opts: Record<string, unknown>): string;
  reset(id: string): void;
}
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

export function useTurnstile(siteKey: string) {
  const ref = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const current = useRef<string | null>(null);
  // lo script (~110 KB) si carica alla prima interazione con il form, non all'apertura della pagina
  const [wanted, setWanted] = useState(false);
  const activate = useCallback(() => setWanted(true), []);

  useEffect(() => {
    if (!wanted) return;
    let cancelled = false;
    const render = () => {
      if (cancelled || !ref.current || !window.turnstile || widget.current) return;
      widget.current = window.turnstile.render(ref.current, {
        sitekey: siteKey,
        appearance: "interaction-only",
        language: "it",
        callback: (t: string) => (current.current = t),
        "expired-callback": () => (current.current = null),
        "error-callback": () => (current.current = null),
      });
    };
    if (window.turnstile) render();
    else {
      let s = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT}"]`);
      if (!s) {
        s = document.createElement("script");
        s.src = SCRIPT;
        s.async = true;
        document.head.appendChild(s);
      }
      s.addEventListener("load", render);
    }
    return () => {
      cancelled = true;
    };
  }, [siteKey, wanted]);

  /** Aspetta il token (al massimo 10 secondi). */
  const token = useCallback(async () => {
    setWanted(true);
    for (let i = 0; i < 100 && !current.current; i++) await new Promise((r) => setTimeout(r, 100));
    if (!current.current) {
      throw new PublicApiError("Verifica anti-bot non riuscita: ricarica la pagina e riprova.", "E_CAPTCHA_FAILED", "");
    }
    return current.current;
  }, []);

  const reset = useCallback(() => {
    current.current = null;
    if (widget.current && window.turnstile) window.turnstile.reset(widget.current);
  }, []);

  return { ref, token, reset, activate };
}
