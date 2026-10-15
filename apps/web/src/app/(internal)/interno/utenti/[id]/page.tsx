import { maskEmail } from "@loyalty/shared/logger";
import Link from "next/link";
import { notFound } from "next/navigation";
import { log } from "@/lib/observability/logger";
import { staffUser } from "@/lib/support/customers";
import { openModesFor } from "@/lib/support/diagnostics";
import { supportPage } from "@/lib/support/run";
import { loadTimeline } from "@/lib/support/timeline";
import { dateTime, UUID_RE } from "../../_ui/format";
import { DiagnosticPanel } from "../../_ui/DiagnosticPanel";
import { Timeline } from "../../_ui/Timeline";

/** Utente staff: negozi, ultimo accesso e timeline delle sue azioni (log, storico, app). */
export default async function Utente({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  return supportPage(`/interno/utenti/${id}`, async (user) => {
    const [u, { blocks, rows }, modes] = await Promise.all([
      staffUser(id),
      loadTimeline({ kind: "utente staff", userId: id }),
      openModesFor("staff_user", id),
    ]);
    log.event("support.timeline.viewed", {
      support_name: user.name,
      subject_kind: "utente staff",
      subject: maskEmail(u.email),
      rows,
    });
    return (
      <>
        <div>
          <h1>{u.memberships[0]?.displayName ?? u.email}</h1>
          <p className="int-sub">
            {u.email} · ultimo accesso {dateTime(u.lastSignInAt)}
          </p>
        </div>
        <DiagnosticPanel scopeType="staff_user" scopeId={id} open={modes} back={`/interno/utenti/${id}`} />
        <section className="int-card">
          <h2>Negozi</h2>
          <ul>
            {u.memberships.map((m) => (
              <li key={m.shopId}>
                <Link href={`/interno/negozi/${m.shopId}`}>{m.shopName}</Link> ·{" "}
                {m.role === "owner" ? "titolare" : "operatore"}
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h2>Timeline (14 giorni)</h2>
          <Timeline blocks={blocks} />
        </section>
      </>
    );
  });
}
