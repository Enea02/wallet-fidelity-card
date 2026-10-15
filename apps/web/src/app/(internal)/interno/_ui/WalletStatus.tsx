import { explainError } from "@loyalty/shared/support/timeline";
import type { GoogleStatus } from "@/lib/support/card-status";
import type { CustomerSummary } from "@/lib/support/customers";
import { dateTime } from "./format";

/** Carta su Google letta in diretta e confrontata con il database, più l'ultimo esito della sincronizzazione. */
export function WalletStatus({ google, sync }: { google: GoogleStatus; sync: CustomerSummary["sync"] }) {
  const g = sync.find((s) => s.wallet === "google");
  const lastError = explainError(g?.last_error_code);
  return (
    <div className="int-form" data-testid="stato-wallet">
      {google.kind === "non configurato" && (
        <p className="int-muted">Google Wallet non è configurato in questo ambiente (GOOGLE_WALLET_ISSUER_ID).</p>
      )}
      {google.kind === "assente" && (
        <p className="int-notice int-notice-warn" data-testid="google-esito">
          La carta non esiste su Google: il cliente non l&apos;ha ancora salvata o la creazione non è riuscita.
          «Risincronizza» la crea.
        </p>
      )}
      {google.kind === "errore" && (
        <p className="int-notice int-notice-error" data-testid="google-esito">
          Lettura da Google non riuscita: {google.code}
          {google.httpStatus ? ` (${google.httpStatus})` : ""}. {google.detail}
        </p>
      )}
      {google.kind === "letta" && (
        <>
          <p
            className={google.aligned ? "int-notice int-notice-ok" : "int-notice int-notice-warn"}
            data-testid="google-esito"
          >
            {google.aligned
              ? "Google mostra esattamente quello che c'è nel database."
              : "Google mostra dati diversi dal database: usare «Risincronizza»."}
          </p>
          <table>
            <thead>
              <tr>
                <th>Campo</th>
                <th>Database</th>
                <th>Google</th>
              </tr>
            </thead>
            <tbody>
              {google.checks.map((c) => (
                <tr key={c.label}>
                  <td>{c.label}</td>
                  <td>{c.db}</td>
                  <td className={c.ok ? "" : "int-lvl-error"}>{c.google}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      <dl>
        <dt>Ultimo invio riuscito</dt>
        <dd>{dateTime(g?.last_success_at)}</dd>
        <dt>Tentativi falliti di fila</dt>
        <dd>{g?.attempts ?? 0}</dd>
        {g?.last_error_code && (
          <>
            <dt>Ultimo errore</dt>
            <dd>
              {dateTime(g.last_error_at)} · <span className="int-code">{g.last_error_code}</span> {g.last_error}
            </dd>
          </>
        )}
        <dt>Apple Wallet</dt>
        <dd className="int-muted">non attivo (arriva con la Fase 12)</dd>
      </dl>
      {lastError && g && g.attempts > 0 && (
        <div className="int-err" style={{ margin: 0 }}>
          <div>
            <strong>Causa probabile:</strong> {lastError.probableCause}
          </div>
          <div>
            <strong>Cosa fare:</strong> {lastError.action}
          </div>
        </div>
      )}
    </div>
  );
}
