import { cardColors, contrast, theme } from "@loyalty/shared/theme";

/*
 * Regole delle impostazioni carta (design T1): ritaglio del logo, testi della carta,
 * verifiche di contrasto, modifiche da salvare. Pure, testate in logic.test.ts.
 */

/** Colori proposti dal design (T1). */
export const SWATCHES = [
  "#5B1F2E",
  "#1F3B34",
  "#2F4B7C",
  "#C8412B",
  "#E86A33",
  "#F7C843",
  "#7FA89A",
  "#2A211C",
] as const;

/** Icone dei timbri proposte dal design (il regalo è riservato al premio). */
export const ICONS = ["scissors", "cup", "pizza", "sparkle", "check"] as const;

/** Tempo minimo tra due timbri: scelte rapide in minuti. */
export const COOLDOWNS = [0, 30, 60, 120, 240, 1440] as const;
export const cooldownLabel = (m: number) =>
  m === 0 ? "Nessuno" : m < 60 ? `${m} minuti` : m === 60 ? "1 ora" : m === 1440 ? "1 giorno" : `${m / 60} ore`;

export const LOGO_SIZE = 660;

/** Quadrato centrato dentro un'immagine w×h (ritaglio automatico del logo sul web). */
export function squareCrop(width: number, height: number) {
  const side = Math.min(width, height);
  return {
    originX: Math.floor((width - side) / 2),
    originY: Math.floor((height - side) / 2),
    width: side,
    height: side,
  };
}

export const isHex = (s: string) => /^#?[0-9a-f]{6}$/i.test(s.trim());
export const normHex = (s: string) => `#${s.trim().replace(/^#/, "").toUpperCase()}`;

/** Le 4 verifiche del design: testo, etichette, timbro vuoto sulla carta; pulsanti nell'app. */
export function contrastChecks(hex: string) {
  const c = cardColors(hex);
  const t = theme(hex, "light");
  const check = (label: string, ratio: number, min: number) => ({ label, ratio, ok: ratio >= min, min });
  return {
    corrected: c.corrected,
    cardHex: c.bg,
    checks: [
      check("Testo carta", contrast(c.fg, c.bg), 4.5),
      check("Etichette", contrast(c.label, c.bg), 4.5),
      check("Timbro vuoto", contrast(c.ring, c.bg), 3),
      check("Pulsanti", contrast(t.accent, t.onAccent), 4.5),
    ],
  };
}

export interface CardDraft {
  name: string;
  hexColor: string;
  stampsRequired: number;
  stampIcon: string;
  rewardLabel: string;
  tagline: string;
  programName: string;
  stampUnit: string;
  stampUnitPlural: string;
  stampCooldownMinutes: number;
}

/** Errori dei campi (stessi limiti del contratto SettingsUpdateBody). */
export function draftErrors(d: CardDraft): Partial<Record<keyof CardDraft, string>> {
  const e: Partial<Record<keyof CardDraft, string>> = {};
  const len = (k: keyof CardDraft, min: number, max: number, what: string) => {
    const v = String(d[k]).trim();
    if (v.length < min || v.length > max) e[k] = `${what}: da ${min} a ${max} caratteri.`;
  };
  len("name", 2, 60, "Nome del negozio");
  len("rewardLabel", 2, 40, "Testo del premio");
  len("programName", 2, 40, "Nome del programma");
  len("stampUnit", 2, 20, "Unità");
  len("stampUnitPlural", 2, 20, "Unità al plurale");
  if (d.tagline.trim().length > 80) e.tagline = "Frase d'apertura: al massimo 80 caratteri.";
  if (!isHex(d.hexColor)) e.hexColor = "Colore non valido: scrivi un codice come #5B1F2E.";
  return e;
}

/** Solo i campi cambiati, nel formato del contratto (tagline vuota = automatica). */
export function draftChanges(saved: CardDraft, d: CardDraft): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(d) as Array<keyof CardDraft>) {
    const a = typeof d[k] === "string" ? String(d[k]).trim() : d[k];
    const b = typeof saved[k] === "string" ? String(saved[k]).trim() : saved[k];
    if (k === "hexColor" ? normHex(String(a)) !== normHex(String(b)) : a !== b) {
      out[k] = k === "hexColor" ? normHex(String(a)) : k === "tagline" ? (String(a) === "" ? null : a) : a;
    }
  }
  return out;
}
