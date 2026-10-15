import Link from "next/link";
import { notFound } from "next/navigation";
import { log } from "@/lib/observability/logger";
import { openModesFor } from "@/lib/support/diagnostics";
import { supportPage } from "@/lib/support/run";
import { shopDetail } from "@/lib/support/shops";
import { loadTimeline } from "@/lib/support/timeline";
import { ActionForm } from "../../_ui/ActionForm";
import { DiagnosticPanel } from "../../_ui/DiagnosticPanel";
import { UUID_RE } from "../../_ui/format";
import { Timeline } from "../../_ui/Timeline";
import { resyncShopAction, shopLegalAction, shopStatusAction } from "../actions";

export default async function Negozio({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ creato?: string }>;
}) {
  const { id } = await params;
  const { creato } = await searchParams;
  if (!UUID_RE.test(id)) notFound();
  return supportPage(`/interno/negozi/${id}`, async (user) => {
    const { shop, staff, customers } = await shopDetail(id);
    const [{ blocks, rows }, modes] = await Promise.all([
      loadTimeline({ kind: "negozio", shopId: shop.id }),
      openModesFor("shop", shop.id),
    ]);
    log.event("support.timeline.viewed", {
      support_name: user.name,
      subject_kind: "negozio",
      subject: shop.name,
      rows,
    });
    const suspended = shop.status === "suspended";
    return (
      <>
        <div>
          <h1 data-testid="negozio-titolo">{shop.name}</h1>
          <p className="int-sub">
            <span className="int-code">/{shop.slug}</span> ·{" "}
            <span
              className={suspended ? "int-badge int-badge-err" : "int-badge int-badge-ok"}
              data-testid="negozio-stato"
            >
              {suspended ? "sospeso" : "attivo"}
            </span>{" "}
            · {customers === 1 ? "1 cliente" : `${customers} clienti`}
          </p>
        </div>
        {creato && (
          <p className="int-notice int-notice-ok" role="status">
            Negozio creato: il titolare ha ricevuto l&apos;invito (se non aveva già un account).
          </p>
        )}

        <div className="int-grid">
          <section className="int-card">
            <h2>Staff</h2>
            <table>
              <tbody>
                {staff.map((m) => (
                  <tr key={m.user_id}>
                    <td>
                      <Link href={`/interno/utenti/${m.user_id}`}>
                        <strong>{m.display_name}</strong>
                      </Link>
                      <div className="int-muted">{m.email}</div>
                    </td>
                    <td>{m.role === "owner" ? "titolare" : "operatore"}</td>
                    <td>
                      {m.invite_pending ? (
                        <span className="int-badge int-badge-warn">invito in attesa</span>
                      ) : (
                        `${m.stamps_given} timbri`
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="int-card">
            <h2>{suspended ? "Riattiva il negozio" : "Sospendi il negozio"}</h2>
            <p className="int-muted">
              {suspended
                ? "App esercente e pagina di iscrizione tornano disponibili; le carte tornano attive su Google entro qualche minuto."
                : "Blocca app esercente e iscrizioni; le carte dei clienti vengono disattivate su Google entro qualche minuto."}
            </p>
            <ActionForm
              action={shopStatusAction}
              submit={suspended ? "Riattiva" : "Sospendi"}
              danger={!suspended}
              confirm={suspended ? "Riattivare il negozio?" : `Sospendere ${shop.name}?`}
              testId="stato-negozio"
            >
              <input type="hidden" name="shopId" value={shop.id} />
              <input type="hidden" name="status" value={suspended ? "active" : "suspended"} />
              <label>
                Motivo
                <input
                  name="reason"
                  required
                  minLength={5}
                  placeholder="abbonamento non rinnovato"
                  data-testid="stato-motivo"
                />
              </label>
            </ActionForm>
          </section>

          <section className="int-card">
            <h2>Google Wallet</h2>
            <p className="int-muted">
              Rimanda a Google il template del negozio e lo stato completo di tutte le carte. Serve dopo un problema di
              credenziali o se molte carte risultano disallineate.
            </p>
            <ActionForm
              action={resyncShopAction}
              submit="Risincronizza tutto il negozio"
              testId="risincronizza-negozio"
            >
              <input type="hidden" name="shopId" value={shop.id} />
              <label>
                Motivo
                <input name="reason" placeholder="credenziali Google sostituite" />
              </label>
            </ActionForm>
          </section>

          <DiagnosticPanel scopeType="shop" scopeId={shop.id} open={modes} back={`/interno/negozi/${shop.id}`} />

          <section className="int-card">
            <h2>Dati per l&apos;informativa</h2>
            <ActionForm action={shopLegalAction} submit="Salva" testId="informativa">
              <input type="hidden" name="shopId" value={shop.id} />
              <label>
                Ragione sociale
                <input name="legalName" defaultValue={shop.legal_name ?? ""} maxLength={120} />
              </label>
              <label>
                Partita IVA
                <input name="vatNumber" defaultValue={shop.vat_number ?? ""} maxLength={20} />
              </label>
              <label>
                Email privacy
                <input name="privacyEmail" type="email" defaultValue={shop.privacy_email ?? ""} />
              </label>
            </ActionForm>
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
