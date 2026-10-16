import Link from "next/link";
import { notFound } from "next/navigation";
import { log } from "@/lib/observability/logger";
import { googleCardStatus } from "@/lib/support/card-status";
import { customerSummary } from "@/lib/support/customers";
import { prepaidOfCustomer } from "@/lib/support/prepaid";
import { openModesFor } from "@/lib/support/diagnostics";
import { supportPage } from "@/lib/support/run";
import { loadTimeline } from "@/lib/support/timeline";
import { dateTime, UUID_RE } from "../../_ui/format";
import { ActionForm } from "../../_ui/ActionForm";
import { DiagnosticPanel } from "../../_ui/DiagnosticPanel";
import { Timeline } from "../../_ui/Timeline";
import { WalletStatus } from "../../_ui/WalletStatus";
import { ExportButton } from "../../_ui/ExportButton";
import { deleteCustomerAction, resyncCardAction } from "../actions";

/** Cliente: saldo, stato della carta nei wallet, azioni GDPR e timeline (iscrizione, timbri, wallet). */
export default async function Cliente({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  return supportPage(`/interno/clienti/${id}`, async (user) => {
    const c = await customerSummary(id);
    const [google, modes, prepaid] = await Promise.all([
      googleCardStatus(c.shop.id, c.id),
      openModesFor("customer", c.id),
      prepaidOfCustomer(c.id),
    ]);
    const { blocks, rows } = await loadTimeline({
      kind: "cliente",
      customerId: c.id,
      shopId: c.shop.id,
      shortCode: c.shortCode,
    });
    log.event("support.timeline.viewed", {
      support_name: user.name,
      subject_kind: "cliente",
      subject: c.shortCode,
      rows,
    });
    return (
      <>
        <div>
          <h1 data-testid="cliente-titolo">
            Carta <span className="int-code">{c.shortCode}</span> · {c.name}
          </h1>
          <p className="int-sub">
            <Link href={`/interno/negozi/${c.shop.id}`}>{c.shop.name}</Link> · iscritto il {dateTime(c.createdAt)}
            {c.deletedAt && <span className="int-badge int-badge-err"> cancellato il {dateTime(c.deletedAt)}</span>}
          </p>
        </div>
        <div className="int-grid">
          <section className="int-card">
            <h2>Saldo nel database</h2>
            <dl>
              <dt>Timbri</dt>
              <dd data-testid="cliente-timbri">
                {c.stamps} / {c.shop.stamps_required}
              </dd>
              <dt>Premi</dt>
              <dd>{c.rewards}</dd>
              <dt>Telefono</dt>
              <dd>{c.phoneMasked ?? "—"}</dd>
              <dt>Promozioni</dt>
              <dd>{c.consentMarketing ? "consenso dato" : "nessun consenso"}</dd>
            </dl>
          </section>
          <section className="int-card">
            <h2>Carta nei wallet</h2>
            <WalletStatus google={google} sync={c.sync} />
            {google.kind !== "non configurato" && (
              <ActionForm action={resyncCardAction} submit="Risincronizza" testId="risincronizza">
                <input type="hidden" name="customerId" value={c.id} />
                <input type="hidden" name="shopId" value={c.shop.id} />
                <label>
                  Motivo
                  <input
                    name="reason"
                    placeholder="il cliente vede ancora 6 timbri"
                    data-testid="risincronizza-motivo"
                  />
                </label>
              </ActionForm>
            )}
          </section>
          <section className="int-card">
            <h2>Richieste GDPR</h2>
            <p className="int-muted">
              Esportazione dei dati da inviare all&apos;interessato e cancellazione su richiesta.
            </p>
            <ExportButton customerId={c.id} />
            {!c.deletedAt && (
              <ActionForm
                action={deleteCustomerAction}
                submit="Cancella i dati del cliente"
                danger
                confirm="La cancellazione non si può annullare."
                testId="cancella"
              >
                <input type="hidden" name="customerId" value={c.id} />
                <input type="hidden" name="shopId" value={c.shop.id} />
                <input type="hidden" name="shortCode" value={c.shortCode} />
                <label>
                  Motivo
                  <input
                    name="reason"
                    required
                    minLength={5}
                    placeholder="richiesta di cancellazione via email"
                    data-testid="cancella-motivo"
                  />
                </label>
                <label>
                  Per confermare scrivi il codice della carta ({c.shortCode})
                  <input name="confirm" required autoComplete="off" data-testid="cancella-codice" />
                </label>
              </ActionForm>
            )}
          </section>
          <DiagnosticPanel scopeType="customer" scopeId={c.id} open={modes} back={`/interno/clienti/${c.id}`} />
        </div>
        {prepaid.length > 0 && (
          <section className="int-card" data-testid="tessere-cliente">
            <h2>Tessere prepagate</h2>
            <table>
              <tbody>
                {prepaid.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <Link href={`/interno/tessere/${p.id}`}>
                        {p.product} · <span className="int-code">{p.shortCode}</span>
                      </Link>
                    </td>
                    <td>{p.deleted ? "cancellata" : p.state.replace("_", " ")}</td>
                    <td>
                      {p.balance} {p.unitPlural}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
        <section>
          <h2>Timeline (14 giorni)</h2>
          <Timeline blocks={blocks} />
        </section>
      </>
    );
  });
}
