import Link from "next/link";
import { listBundles, listModes } from "@/lib/support/diagnostics";
import { supportPage } from "@/lib/support/run";
import { ActionForm } from "../_ui/ActionForm";
import { dateTime } from "../_ui/format";
import { disableDiagnosticAction } from "./actions";

const SCOPE: Record<string, string> = { shop: "negozio", staff_user: "utente staff", customer: "cliente" };

export default async function Diagnostica() {
  return supportPage("/interno/diagnostica", async () => {
    const [modes, bundles] = await Promise.all([listModes(), listBundles()]);
    return (
      <>
        <div>
          <h1>Diagnostica</h1>
          <p className="int-sub">
            Modalità diagnostica attive (si attivano dalla pagina di negozio, cliente o utente) e pacchetti «Invia
            diagnostica» ricevuti dalle app.
          </p>
        </div>
        <section className="int-card">
          <h2>Attive</h2>
          {modes.open.length === 0 && <p className="int-muted">Nessuna modalità diagnostica attiva.</p>}
          <table>
            <tbody>
              {modes.open.map((m) => (
                <tr key={m.id}>
                  <td>
                    {SCOPE[m.scope_type]} <strong>{m.scope_label}</strong> · {m.level}
                    <div className="int-muted">
                      fino al {dateTime(m.expires_at)} · {m.enabled_by}: {m.reason}
                    </div>
                  </td>
                  <td>
                    <ActionForm action={disableDiagnosticAction} submit="Disattiva">
                      <input type="hidden" name="id" value={m.id} />
                    </ActionForm>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="int-card">
          <h2>Pacchetti ricevuti</h2>
          <table>
            <thead>
              <tr>
                <th>Ticket</th>
                <th>Ricevuto</th>
                <th>Negozio</th>
                <th>App</th>
                <th>Righe</th>
              </tr>
            </thead>
            <tbody>
              {bundles.map((b) => (
                <tr key={b.ticket_code}>
                  <td>
                    <Link href={`/interno/diagnostica/${b.ticket_code}`}>{b.ticket_code}</Link>
                  </td>
                  <td>{dateTime(b.created_at)}</td>
                  <td>{b.shopName ?? "—"}</td>
                  <td>
                    {b.platform ?? "?"} {b.app_version ?? ""}
                  </td>
                  <td>{b.events}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        {modes.recent.length > 0 && (
          <section className="int-card">
            <h2>Ultime chiuse</h2>
            <table>
              <tbody>
                {modes.recent.map((m) => (
                  <tr key={m.id}>
                    <td>
                      {SCOPE[m.scope_type]} {m.scope_label} · {m.level}
                    </td>
                    <td className="int-muted">
                      {dateTime(m.enabled_at)} →{" "}
                      {m.disabled_at ? `disattivata da ${m.disabled_by}` : `scaduta ${dateTime(m.expires_at)}`}
                    </td>
                    <td className="int-muted">{m.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </>
    );
  });
}
