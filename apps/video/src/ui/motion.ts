import type { CSSProperties } from "react";
import { Easing, interpolate, spring } from "remotion";
import { FPS } from "./theme";

/** Entrata dal basso con dissolvenza, `delay` in fotogrammi dall'inizio della scena. */
export function rise(frame: number, delay = 0, distance = 40): CSSProperties {
  const p = spring({ frame: frame - delay, fps: FPS, config: { damping: 200 } });
  return { opacity: p, transform: `translateY(${(1 - p) * distance}px)` };
}

/** Uscita in dissolvenza negli ultimi `length` fotogrammi di una scena lunga `duration`. */
export function fadeOut(frame: number, duration: number, length = 12): number {
  return interpolate(frame, [duration - length, duration], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
}

/** Valore da 0 a 1 tra due fotogrammi, con un'accelerazione morbida. */
export function progress(frame: number, from: number, to: number): number {
  return interpolate(frame, [from, to], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic),
  });
}
