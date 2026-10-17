import type { PointsView } from "@loyalty/shared/api";

/*
 * Scheda della carta a punti in cassa (Fase 9.6): importo dello scontrino → punti, come add_points
 * nel database (per difetto, zero sotto la spesa minima). "Annulla" per 5 minuti dopo i punti dati qui.
 */

export const UNDO_WINDOW_MS = 5 * 60 * 1000;
export const MAX_CENTS = 1_000_000;

/** "23,50" · "23.5" · "23" → centesimi; null se non è un importo valido (fino a 10.000 €). */
export function parseEuro(text: string): number | null {
  const t = text.trim().replace(/\s|€/g, "").replace(",", ".");
  if (!/^\d{1,5}(\.\d{1,2})?$/.test(t)) return null;
  const cents = Math.round(Number(t) * 100);
  return cents >= 1 && cents <= MAX_CENTS ? cents : null;
}

/** Punti per l'importo, con la stessa regola del server. */
export const pointsFor = (cents: number, card: Pick<PointsView, "pointsPerEuro" | "minCents">) =>
  cents < card.minCents ? 0 : Math.floor((cents * card.pointsPerEuro) / 100);

export const euro = (cents: number) => `${(cents / 100).toFixed(2).replace(".", ",")} €`;
export const pts = (n: number) => (n === 1 ? "1 punto" : `${n} punti`);

/** Anteprima sotto l'importo: "+23 punti" oppure perché non ne dà. */
export function preview(text: string, card: Pick<PointsView, "pointsPerEuro" | "minCents">) {
  if (!text.trim()) return { cents: null, points: 0, hint: "Scrivi l'importo dello scontrino." };
  const cents = parseEuro(text);
  if (cents === null)
    return { cents: null, points: 0, hint: "Importo non valido: ad esempio 23,50 (al massimo 10.000 €)." };
  const points = pointsFor(cents, card);
  if (points === 0) {
    return {
      cents,
      points,
      hint:
        cents < card.minCents
          ? `Sotto la spesa minima di ${euro(card.minCents)}: nessun punto.`
          : "Importo troppo basso per un punto.",
    };
  }
  return { cents, points, hint: `+${pts(points)}` };
}

/** Riga sotto il saldo: "Gold · ancora 120 punti per Platinum". */
export function levelLine(card: Pick<PointsView, "level" | "nextLevel" | "toNext">) {
  return card.nextLevel
    ? `${card.level} · ancora ${pts(card.toNext)} per ${card.nextLevel}`
    : `${card.level} · livello più alto`;
}

export const undoSecondsLeft = (lastAddAt: number | null, now: number) =>
  lastAddAt === null ? 0 : Math.max(0, Math.ceil((lastAddAt + UNDO_WINDOW_MS - now) / 1000));
