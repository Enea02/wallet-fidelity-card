import type { Metadata } from "next";
import { AppError } from "@loyalty/shared/errors";
import { log } from "@/lib/observability/logger";
import { inspectUnsubscribeLink } from "@/lib/public/unsubscribe";
import { StatusScreen } from "../../_components/StatusScreen";
import { UnsubscribeConfirm } from "./UnsubscribeConfirm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Disiscrizione dalle promozioni", robots: { index: false } };

/** Disiscrizione dalle promozioni dal link nei messaggi (firmato, monouso, con conferma). */
export default async function Unsubscribe({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let info;
  try {
    info = await inspectUnsubscribeLink(token);
  } catch (e) {
    if (!(e instanceof AppError) || e.code !== "E_LINK_INVALID") throw e;
    log.event("public.link.invalid", { link_kind: "disiscrizione", reason: e.message });
    return (
      <StatusScreen title="Link non valido">
        <p className="lw-lead">
          Questo link di disiscrizione non è valido. Se vuoi smettere di ricevere promozioni, chiedilo in negozio.
        </p>
      </StatusScreen>
    );
  }

  if (info.alreadyUsed) {
    return (
      <StatusScreen title="Sei già disiscritto">
        <p className="lw-lead">
          Non ricevi più promozioni da <strong>{info.shopName}</strong>. La tua carta resta attiva con tutti i timbri.
        </p>
      </StatusScreen>
    );
  }
  return (
    <StatusScreen title="Niente più promozioni?">
      <UnsubscribeConfirm token={token} shopName={info.shopName} />
    </StatusScreen>
  );
}
