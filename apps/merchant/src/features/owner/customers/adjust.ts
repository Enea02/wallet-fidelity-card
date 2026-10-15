/** Motivi rapidi della rettifica (design T3) e regole del foglio "Correggi saldo". */
export const ADJUST_REASONS = ["Timbro dimenticato", "Errore dello staff", "Carta di carta vecchia", "Altro"] as const;
export type AdjustReason = (typeof ADJUST_REASONS)[number];

export const REASON_MIN = 5;

/** Motivo da salvare nello storico: il motivo rapido, o il testo scritto per "Altro" (o come dettaglio). */
export function adjustReason(chip: AdjustReason | null, text: string): string | null {
  const extra = text.trim();
  if (chip === "Altro" || chip === null) return extra.length >= REASON_MIN ? extra : null;
  return extra ? `${chip}: ${extra}` : chip;
}

/** "+1 timbro", "−2 timbri, +1 premio", "nessuna modifica". */
export function adjustSummary(stampsFrom: number, stampsTo: number, rewardsFrom: number, rewardsTo: number): string {
  const s = stampsTo - stampsFrom;
  const r = rewardsTo - rewardsFrom;
  const fmt = (n: number, one: string, many: string) =>
    `${n > 0 ? "+" : "−"}${Math.abs(n)} ${Math.abs(n) === 1 ? one : many}`;
  const parts = [s ? fmt(s, "timbro", "timbri") : "", r ? fmt(r, "premio", "premi") : ""].filter(Boolean);
  return parts.length ? parts.join(", ") : "nessuna modifica";
}
