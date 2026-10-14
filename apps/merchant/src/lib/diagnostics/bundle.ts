import { DIAGNOSTICS_MAX_BYTES } from "@loyalty/shared/api";
import type { LogLine } from "@loyalty/shared/logger";

/** Byte UTF-8 di una stringa (senza TextEncoder, non garantito su tutte le piattaforme). */
export function utf8Length(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff) {
      n += 4;
      i++;
    } else n += 3;
  }
  return n;
}

/**
 * Pacchetto "Invia diagnostica": se supera il limite del server si scartano gli eventi più vecchi
 * (gli ultimi sono quelli che spiegano il problema appena successo).
 */
export function fitBundle(
  device: Record<string, unknown>,
  events: LogLine[],
  note: string | undefined,
  max = DIAGNOSTICS_MAX_BYTES - 1024,
): { body: { device: Record<string, unknown>; events: LogLine[]; note?: string }; size: number; dropped: number } {
  let kept = events;
  const make = () => ({ device, events: kept, ...(note ? { note } : {}) });
  let size = utf8Length(JSON.stringify(make()));
  while (size > max && kept.length > 0) {
    // stima di quanti eventi togliere in un colpo, poi si ricontrolla
    const avg = size / Math.max(1, kept.length);
    const drop = Math.max(1, Math.ceil((size - max) / avg));
    kept = kept.slice(drop);
    size = utf8Length(JSON.stringify(make()));
  }
  return { body: make(), size, dropped: events.length - kept.length };
}
