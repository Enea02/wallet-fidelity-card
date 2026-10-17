import { prepaidDate } from "@loyalty/shared/copy";
import Link from "next/link";
import { notFound } from "next/navigation";
import { log } from "@/lib/observability/logger";
import { googlePrepaidStatus, prepaidSummaryForSupport } from "@/lib/support/prepaid";
import { supportPage } from "@/lib/support/run";
import { loadTimeline } from "@/lib/support/timeline";
import { ActionForm } from "../../_ui/ActionForm";
import { dateTime, UUID_RE } from "../../_ui/format";
import { Timeline } from "../../_ui/Timeline";
import { WalletStatus } from "../../_ui/WalletStatus";
import { resyncPrepaidAction } from "../actions";

const STATE = { da_attivare: "da attivare", attiva: "attiva", esaurita: "esaurita", scaduta: "scaduta" } as const;

/** Tessera prepagata (Fase 9.5): stato, saldo, Google confrontato con il database, timeline. */
export default async function Tessera({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  return supportPage(`/interno/tessere/${id}`, async (user) => {
    const t = await prepaidSummaryForSupport(id);
    const [google, { blocks, rows }] = await Promise.all([
      googlePrepaidStatus(id),
      loadTimeline({ kind: "tessera", cardId: t.card.id, shopId: t.shop.id, shortCode: t.card.short_code }),
    ]);
    log.event("support.timeline.viewed", {
      support_name: user.name,
      subject_kind: "tessera",
      subject: t.card.short_code,
      rows,
    });
    const sync = t.sync.map((s) => ({
      wallet: s.wallet,
      synced_stamps: s.synced_balance,
      synced_rewards: null,
      synced_state: s.synced_state,
      last_success_at: s.last_success_at,
      last_error_at: s.last_error_at,
      last_error_code: s.last_error_code,
      last_error: s.last_error,
      attempts: s.attempts,
      request_id: null,
    }));
    return (
      <>
        <div>
          <h1 data-testid="tessera-titolo">
            Tessera <span className="int-code">{t.card.short_code}</span> · {t.product.name}
          </h1>
          <p className="int-sub">
            <Link href={`/interno/negozi/${t.shop.id}`}>{t.shop.name}</Link> · cliente{" "}
            <Link href={`/interno/clienti/${t.person.id}`}>{t.person.name}</Link> · creata il{" "}
            {dateTime(t.card.created_at)}
            {t.card.deleted_at && (
              <span className="int-badge int-badge-err"> cancellata il {dateTime(t.card.deleted_at)}</span>
            )}
          </p>
        </div>
        <div className="int-grid">
          <section className="int-card">
            <h2>Saldo nel database</h2>
            <dl>
              <dt>Stato</dt>
              <dd data-testid="tessera-stato">{STATE[t.state]}</dd>
              <dt>Saldo</dt>
              <dd>
                {t.card.balance} {t.product.unit_plural} (caricate {t.card.charged_units})
              </dd>
              <dt>Attivata</dt>
              <dd>{dateTime(t.card.activated_at)}</dd>
              <dt>Scadenza</dt>
              <dd>{t.card.expires_at ? prepaidDate(t.card.expires_at) : "nessuna"}</dd>
            </dl>
          </section>
          <section className="int-card">
            <h2>Tessera nei wallet</h2>
            <WalletStatus google={google} sync={sync} />
            {google.kind !== "non configurato" && (
              <ActionForm action={resyncPrepaidAction} submit="Risincronizza" testId="risincronizza-tessera">
                <input type="hidden" name="cardId" value={t.card.id} />
                <label>
                  Motivo
                  <input name="reason" placeholder="il cliente vede ancora il saldo vecchio" />
                </label>
              </ActionForm>
            )}
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
