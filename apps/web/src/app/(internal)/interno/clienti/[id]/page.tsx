import Link from "next/link";
import { notFound } from "next/navigation";
import { log } from "@/lib/observability/logger";
import { customerSummary } from "@/lib/support/customers";
import { supportPage } from "@/lib/support/run";
import { loadTimeline } from "@/lib/support/timeline";
import { dateTime, UUID_RE } from "../../_ui/format";
import { Timeline } from "../../_ui/Timeline";

/** Cliente: saldo, stato della carta nei wallet, azioni GDPR e timeline (iscrizione, timbri, wallet). */
export default async function Cliente({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  return supportPage(`/interno/clienti/${id}`, async (user) => {
    const c = await customerSummary(id);
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
        </div>
        <section>
          <h2>Timeline (14 giorni)</h2>
          <Timeline blocks={blocks} />
        </section>
      </>
    );
  });
}
