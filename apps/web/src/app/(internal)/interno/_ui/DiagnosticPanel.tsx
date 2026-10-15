import type { DiagnosticScopeType } from "@loyalty/shared/logging/events";
import type { ModeRow } from "@/lib/support/diagnostics";
import { disableDiagnosticAction, enableDiagnosticAction } from "../diagnostica/actions";
import { ActionForm } from "./ActionForm";
import { dateTime } from "./format";

/** Attivazione della modalità diagnostica per un negozio, un utente staff o un cliente (scope, durata, motivo). */
export function DiagnosticPanel({
  scopeType,
  scopeId,
  open,
  back,
}: {
  scopeType: DiagnosticScopeType;
  scopeId: string;
  open: ModeRow[];
  back: string;
}) {
  return (
    <section className="int-card">
      <h2>Modalità diagnostica</h2>
      {open.map((m) => (
        <div key={m.id} className="int-form">
          <p className="int-notice int-notice-warn" data-testid="diagnostica-attiva">
            Attiva ({m.level}) fino al {dateTime(m.expires_at)}, da {m.enabled_by}: {m.reason}
          </p>
          <ActionForm action={disableDiagnosticAction} submit="Disattiva ora" testId="diagnostica-disattiva">
            <input type="hidden" name="id" value={m.id} />
            <input type="hidden" name="back" value={back} />
          </ActionForm>
        </div>
      ))}
      {open.length === 0 && (
        <>
          <p className="int-muted">
            Registra anche i log di dettaglio (debug) con i payload delle chiamate, solo per questo{" "}
            {scopeType === "shop" ? "negozio" : scopeType === "customer" ? "cliente" : "utente"}, fino alla scadenza.
          </p>
          <ActionForm action={enableDiagnosticAction} submit="Attiva" testId="diagnostica-attiva-form">
            <input type="hidden" name="scopeType" value={scopeType} />
            <input type="hidden" name="scopeId" value={scopeId} />
            <input type="hidden" name="back" value={back} />
            <div className="int-row">
              <label>
                Durata
                <select name="hours" defaultValue="24">
                  <option value="2">2 ore</option>
                  <option value="24">24 ore</option>
                  <option value="72">3 giorni</option>
                  <option value="168">7 giorni (massimo)</option>
                </select>
              </label>
              <label>
                Livello
                <select name="level" defaultValue="debug">
                  <option value="debug">debug (consigliato)</option>
                  <option value="trace">trace (tutto)</option>
                </select>
              </label>
            </div>
            <label>
              Motivo
              <input
                name="reason"
                required
                minLength={5}
                placeholder="timbri che non arrivano sulla carta"
                data-testid="diagnostica-motivo"
              />
            </label>
          </ActionForm>
        </>
      )}
    </section>
  );
}
