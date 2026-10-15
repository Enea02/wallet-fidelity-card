import type { LogLevel } from "@loyalty/shared/logging/events";
import type { TimelineBlock } from "@loyalty/shared/support/timeline";
import { dateTime, time } from "./format";

const ICON: Record<LogLevel, { glyph: string; label: string }> = {
  error: { glyph: "✕", label: "errore" },
  warn: { glyph: "!", label: "avviso" },
  info: { glyph: "·", label: "informazione" },
  debug: { glyph: "…", label: "dettaglio (diagnostica)" },
  trace: { glyph: "…", label: "dettaglio (diagnostica)" },
};

function Level({ level }: { level: LogLevel }) {
  const i = ICON[level];
  return (
    <span className={`int-lvl-${level}`} title={i.label} aria-label={i.label}>
      {i.glyph}
    </span>
  );
}

const SOURCE: Record<string, string> = { log: "", audit: "storico", app: "app" };

/**
 * Timeline unificata: blocchi per request_id (ora locale · livello · frase, con i passi in breve),
 * dettagli e campi completi al clic; per gli errori descrizione, causa e azione dal catalogo.
 */
export function Timeline({ blocks, empty }: { blocks: TimelineBlock[]; empty?: string }) {
  if (blocks.length === 0) return <p className="int-muted">{empty ?? "Nessuna riga negli ultimi 14 giorni."}</p>;
  return (
    <div className="int-tl" data-testid="timeline">
      {blocks.map((b, n) => (
        <details
          key={`${b.request_id ?? "riga"}-${n}`}
          className="int-tl-group"
          open={b.level === "error" || b.level === "warn" || blocks.length === 1}
          data-testid="timeline-blocco"
        >
          <summary>
            <span className="int-tl-time">{dateTime(b.ts)}</span>
            <Level level={b.level} />
            <span>
              <span>{b.title}</span>
              {b.steps.length > 1 && <div className="int-tl-steps">{b.steps.join(" → ")}</div>}
            </span>
            {b.support_code && <span className="int-code">{b.support_code}</span>}
          </summary>
          <div className="int-tl-body">
            {b.errors.map((e) => (
              <div key={e.code} className="int-err" data-testid="errore-catalogo">
                <div>
                  <strong>{e.code}</strong> · {e.description}
                </div>
                <div>
                  <strong>Causa probabile:</strong> {e.probableCause}
                </div>
                <div data-testid="errore-azione">
                  <strong>Cosa fare:</strong> {e.action}
                </div>
              </div>
            ))}
            {b.items.map((i, k) => (
              <details key={k} className="int-tl-line">
                <summary>
                  <span className="int-tl-time">{time(i.ts)}</span>
                  <Level level={i.level} />
                  <span>
                    {SOURCE[i.source] ? <span className="int-badge">{SOURCE[i.source]}</span> : null} {i.msg}{" "}
                    <span className="int-muted">[{i.event}]</span>
                  </span>
                </summary>
                <pre>{JSON.stringify(i.fields, null, 2)}</pre>
              </details>
            ))}
          </div>
        </details>
      ))}
    </div>
  );
}
