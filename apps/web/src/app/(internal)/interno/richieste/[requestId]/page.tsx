import { isRequestId, supportCodeFromRequestId } from "@loyalty/shared/logging/request-id";
import Link from "next/link";
import { notFound } from "next/navigation";
import { log } from "@/lib/observability/logger";
import { supportPage } from "@/lib/support/run";
import { loadTimeline } from "@/lib/support/timeline";
import { Timeline } from "../../_ui/Timeline";

/** Una richiesta (codice assistenza ERR-…): tutte le righe con lo stesso request_id. */
export default async function Richiesta({ params }: { params: Promise<{ requestId: string }> }) {
  const { requestId } = await params;
  const id = requestId.toUpperCase();
  if (!isRequestId(id)) notFound();
  return supportPage(`/interno/richieste/${id}`, async (user) => {
    const { blocks, rows } = await loadTimeline({ kind: "richiesta", requestIds: [id] });
    log.event("support.timeline.viewed", {
      support_name: user.name,
      subject_kind: "richiesta",
      subject: supportCodeFromRequestId(id),
      rows,
    });
    const fields = blocks.flatMap((b) => b.items.map((i) => i.fields));
    const shopId = fields.map((f) => f.shop_id).find((v): v is string => typeof v === "string");
    const userId = fields.map((f) => f.user_id).find((v): v is string => typeof v === "string");
    const card = fields.map((f) => f.customer_ref).find((v): v is string => typeof v === "string");
    return (
      <>
        <div>
          <h1>
            Richiesta <span className="int-code">{supportCodeFromRequestId(id)}</span>
          </h1>
          <p className="int-sub">
            request_id <span className="int-code">{id}</span>
            {shopId && (
              <>
                {" · "}
                <Link href={`/interno/negozi/${shopId}`}>negozio</Link>
              </>
            )}
            {userId && (
              <>
                {" · "}
                <Link href={`/interno/utenti/${userId}`}>utente staff</Link>
              </>
            )}
            {card && (
              <>
                {" · "}
                <Link href={`/interno?q=${card}`}>carta {card}</Link>
              </>
            )}
          </p>
        </div>
        <Timeline
          blocks={blocks}
          empty="Nessuna riga per questa richiesta: è più vecchia di 30 giorni oppure non è mai arrivata al server (cercare il pacchetto di diagnostica dell'app)."
        />
      </>
    );
  });
}
