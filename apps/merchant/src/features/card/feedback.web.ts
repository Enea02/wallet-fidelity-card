/*
 * Feedback sul web: un beep breve (facoltativo, interruttore nello scanner) e la vibrazione
 * dove il browser la supporta (Chrome su Android). Niente file audio: suono sintetizzato.
 */
let ctx: AudioContext | null = null;

function beep(freqs: number[], ms: number) {
  try {
    ctx ??= new AudioContext();
    const t0 = ctx.currentTime;
    freqs.forEach((f, i) => {
      const osc = ctx!.createOscillator();
      const gain = ctx!.createGain();
      osc.frequency.value = f;
      osc.type = "sine";
      const start = t0 + (i * ms) / 1000;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.2, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + ms / 1000);
      osc.connect(gain).connect(ctx!.destination);
      osc.start(start);
      osc.stop(start + ms / 1000);
    });
  } catch {
    // audio non disponibile (permessi del browser): il feedback visivo basta
  }
}

export function feedback(kind: "stamp" | "reward" | "error", sound = false) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate(kind === "reward" ? [30, 60, 30] : kind === "error" ? [40, 40, 40] : 20);
  }
  if (!sound) return;
  if (kind === "stamp") beep([880], 90);
  else if (kind === "reward") beep([660, 880, 1320], 110);
  else beep([220], 180);
}
