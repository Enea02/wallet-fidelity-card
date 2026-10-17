import type { PointsLevel } from "@loyalty/shared/copy";

/*
 * Carta a punti nelle impostazioni (Fase 9.6): regola e livelli, con gli stessi limiti del
 * contratto SettingsUpdateBody e di update_points_settings (1-5 livelli, il primo da 0 punti,
 * soglie crescenti, nomi diversi).
 */

export interface PointsDraft {
  mode: "timbri" | "punti";
  pointsPerEuro: number;
  /** Spesa minima in euro, come la scrive il titolare ("5" o "4,50"; vuoto = nessuna). */
  minEuro: string;
  levels: Array<{ name: string; min: string; perk: string }>;
}

export const MAX_LEVELS = 5;

export const centsToEuro = (c: number) => (c === 0 ? "" : (c / 100).toFixed(2).replace(".", ",").replace(/,00$/, ""));

export function toPointsDraft(s: {
  loyaltyMode: "timbri" | "punti";
  pointsPerEuro: number;
  pointsMinCents: number;
  pointsLevels: PointsLevel[];
}): PointsDraft {
  return {
    mode: s.loyaltyMode,
    pointsPerEuro: s.pointsPerEuro,
    minEuro: centsToEuro(s.pointsMinCents),
    levels: s.pointsLevels.map((l) => ({ name: l.name, min: String(l.min), perk: l.perk })),
  };
}

export function minCentsOf(text: string): number | null {
  const t = text.trim().replace(",", ".");
  if (t === "") return 0;
  if (!/^\d{1,4}(\.\d{1,2})?$/.test(t)) return null;
  const c = Math.round(Number(t) * 100);
  return c <= 100_000 ? c : null;
}

export interface PointsProblems {
  minEuro?: string;
  levels?: string;
  /** Problema del singolo livello, per indice. */
  level: Record<number, string>;
}

export function pointsProblems(d: PointsDraft): PointsProblems {
  const p: PointsProblems = { level: {} };
  if (minCentsOf(d.minEuro) === null) p.minEuro = "Un importo fino a 1000 €, ad esempio 5 o 4,50.";
  if (d.levels.length < 1 || d.levels.length > MAX_LEVELS) p.levels = `Da 1 a ${MAX_LEVELS} livelli.`;
  const names = new Set<string>();
  let prev = -1;
  d.levels.forEach((l, i) => {
    const name = l.name.trim();
    const min = Number(l.min);
    if (name.length < 2 || name.length > 20) p.level[i] = "Nome da 2 a 20 caratteri.";
    else if (names.has(name.toLowerCase())) p.level[i] = "Due livelli con lo stesso nome.";
    else if (l.min.trim() === "" || !Number.isInteger(min) || min < 0 || min > 10_000_000)
      p.level[i] = "Soglia in punti da 0 a 10.000.000.";
    else if (i === 0 && min !== 0) p.level[i] = "Il primo livello parte da 0 punti.";
    else if (i > 0 && min <= prev) p.level[i] = "Ogni livello deve chiedere più punti del precedente.";
    else if (l.perk.trim().length > 80) p.level[i] = "Vantaggio al massimo di 80 caratteri.";
    names.add(name.toLowerCase());
    if (Number.isInteger(min)) prev = min;
  });
  return p;
}

export const hasProblems = (p: PointsProblems) =>
  p.minEuro !== undefined || p.levels !== undefined || Object.keys(p.level).length > 0;

/** Livelli da inviare (stessa forma di shops.points_levels). */
export const levelsOf = (d: PointsDraft): PointsLevel[] =>
  d.levels.map((l) => ({ name: l.name.trim(), min: Number(l.min), perk: l.perk.trim() }));

/** Campi cambiati rispetto al salvato, nel formato del corpo di updateSettings. */
export function pointsChanges(saved: PointsDraft, d: PointsDraft) {
  const out: {
    loyaltyMode?: "timbri" | "punti";
    pointsPerEuro?: number;
    pointsMinCents?: number;
    pointsLevels?: PointsLevel[];
  } = {};
  if (d.mode !== saved.mode) out.loyaltyMode = d.mode;
  if (d.pointsPerEuro !== saved.pointsPerEuro) out.pointsPerEuro = d.pointsPerEuro;
  const min = minCentsOf(d.minEuro);
  if (min !== null && min !== minCentsOf(saved.minEuro)) out.pointsMinCents = min;
  if (JSON.stringify(levelsOf(d)) !== JSON.stringify(levelsOf(saved))) out.pointsLevels = levelsOf(d);
  return out;
}
