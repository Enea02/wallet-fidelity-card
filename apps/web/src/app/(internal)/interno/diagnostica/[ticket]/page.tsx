import Link from "next/link";
import { notFound } from "next/navigation";
import { log } from "@/lib/observability/logger";
import { bundleDetail } from "@/lib/support/diagnostics";
import { supportPage } from "@/lib/support/run";
import { dateTime } from "../../_ui/format";
import { Timeline } from "../../_ui/Timeline";

/** Pacchetto «Invia diagnostica»: dispositivo e ultimi eventi dell'app, raggruppati per richiesta. */
export default async function Pacchetto({ params }: { params: Promise<{ ticket: string }> }) {
  const { ticket } = await params;
  const code = ticket.toUpperCase();
  if (!/^DIAG-[0-9A-Z]{8}$/.test(code)) notFound();
  return supportPage(`/interno/diagnostica/${code}`, async (user) => {
    const b = await bundleDetail(code);
    if (!b) notFound();
    log.event("support.timeline.viewed", {
      support_name: user.name,
      subject_kind: "pacchetto diagnostica",
      subject: code,
      rows: b.events,
    });
    return (
      <>
        <div>
          <h1>
            Pacchetto <span className="int-code">{b.ticket_code}</span>
          </h1>
          <p className="int-sub">
            ricevuto il {dateTime(b.created_at)}
            {b.shop_id && (
              <>
                {" · "}
                <Link href={`/interno/negozi/${b.shop_id}`}>{b.shopName}</Link>
              </>
            )}
            {b.user_id && (
              <>
                {" · "}
                <Link href={`/interno/utenti/${b.user_id}`}>utente staff</Link>
              </>
            )}
          </p>
        </div>
        <section className="int-card">
          <h2>Dispositivo</h2>
          <dl>
            {Object.entries(b.device).map(([k, v]) => (
              <div key={k} style={{ display: "contents" }}>
                <dt>{k}</dt>
                <dd>{typeof v === "object" ? JSON.stringify(v) : String(v)}</dd>
              </div>
            ))}
            {b.note && (
              <>
                <dt>Nota</dt>
                <dd>{b.note}</dd>
              </>
            )}
          </dl>
        </section>
        <section>
          <h2>Eventi dell&apos;app ({b.events})</h2>
          <Timeline blocks={b.blocks} empty="Il pacchetto non contiene eventi." />
        </section>
      </>
    );
  });
}
