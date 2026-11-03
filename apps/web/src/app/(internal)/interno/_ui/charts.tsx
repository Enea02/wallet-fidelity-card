import { axisMax, num, shortDay, sparkPoints } from "@/lib/support/overview-view";

/** Barre giornaliere (ultimi 30 giorni, l'ultima è oggi) con asse a 4 tacche ed etichette dei giorni. */
export function DayBars({
  days,
  values,
  label,
  color,
}: {
  days: string[];
  values: number[];
  label: string;
  color?: string | undefined;
}) {
  const max = axisMax(values);
  const ticks = [max, (max * 2) / 3, max / 3, 0].map((v) => num(Math.round(v)));
  const marks = [0, 7, 14, 21].map((i) => days[i]).filter(Boolean) as string[];
  return (
    <div
      className="int-chart"
      role="img"
      aria-label={label}
      style={color ? ({ "--int-bar": color } as React.CSSProperties) : undefined}
    >
      <div className="int-chart-axis" aria-hidden="true">
        {ticks.map((t, i) => (
          <span key={i}>{t}</span>
        ))}
      </div>
      <div className="int-chart-plot" aria-hidden="true">
        <div className="int-bars">
          {values.map((v, i) => (
            <div
              key={days[i] ?? i}
              className={i === values.length - 1 ? "int-bar int-bar-today" : "int-bar"}
              style={{ height: `${Math.max(1, (v / max) * 100)}%` }}
              title={`${days[i] ? shortDay(`${days[i]}T12:00:00Z`) : ""}: ${num(v)}`}
            />
          ))}
        </div>
        <div className="int-chart-days">
          {marks.map((d) => (
            <span key={d}>{shortDay(`${d}T12:00:00Z`)}</span>
          ))}
          <span>oggi</span>
        </div>
      </div>
    </div>
  );
}

/** Linea dell'attività di 30 giorni nelle card dei negozi. */
export function Spark({ values, color, label }: { values: number[]; color: string; label: string }) {
  return (
    <svg className="int-spark" viewBox="0 0 140 34" preserveAspectRatio="none" role="img" aria-label={label}>
      <polyline
        points={sparkPoints(values)}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/** Descrizione a parole dell'andamento (per i lettori di schermo). */
export function trendLabel(values: number[], what: string): string {
  const total = values.reduce((a, b) => a + b, 0);
  if (total === 0) return `Nessuna attività (${what}) negli ultimi 30 giorni`;
  const half = Math.floor(values.length / 2);
  const a = values.slice(0, half).reduce((x, y) => x + y, 0);
  const b = values.slice(half).reduce((x, y) => x + y, 0);
  const trend = b > a * 1.15 ? "in crescita" : b < a * 0.85 ? "in calo" : "stabile";
  return `${what} negli ultimi 30 giorni: ${num(total)} in tutto, ${trend}`;
}
