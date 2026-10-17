import type { Metadata } from "next";
import { requireEnv } from "@/lib/env";
import { getShopBySlug } from "@/lib/loyalty";
import { log } from "@/lib/observability/logger";
import { getProductByCode } from "@/lib/prepaid";
import { productHeadline, publicProduct, publicShop } from "@/lib/public/shop-view";
import { themeCss } from "@/lib/public/theme-style";
import { StatusScreen } from "../../../_components/StatusScreen";
import { EnrollFlow } from "../../EnrollFlow";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ shop: string; code: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { shop: slug, code } = await params;
  const shop = await getShopBySlug(slug);
  const product = shop ? await getProductByCode(shop.id, code) : null;
  return { title: shop && product ? `${shop.name} · ${product.name}` : "Tessera" };
}

/** Iscrizione a una tessera prepagata (Fase 9.5) o a un abbonamento (Fase 9.6): si crea qui, si paga e si attiva in negozio. */
export default async function PrepaidEnrollPage({ params }: Props) {
  const { shop: slug, code } = await params;
  const shop = await getShopBySlug(slug);
  const product = shop ? await getProductByCode(shop.id, code) : null;

  if (!shop || shop.status !== "active" || !product || !product.active) {
    log.event("enroll.shop.unavailable", {
      slug: `${slug}/t/${code}`,
      reason: !shop ? "inesistente" : shop.status !== "active" ? "sospeso" : "tessera non disponibile",
    });
    return (
      <StatusScreen title="Tessera non disponibile" {...(shop && { brand: shop.hex_color })}>
        <p className="lw-lead">
          Questa tessera non è (più) disponibile
          {shop ? (
            <>
              {" "}
              da <strong>{shop.name}</strong>
            </>
          ) : null}
          . Chiedi in negozio il QR giusto.
        </p>
      </StatusScreen>
    );
  }

  const view = publicShop(shop);
  const p = publicProduct(product);
  const header = (
    <header className="lw-hero">
      <div className="lw-brand">
        {/* eslint-disable-next-line @next/next/no-img-element -- logo o monogramma generato */}
        <img src={view.logo} alt="" width={52} height={52} />
        <div>
          <strong>{view.name}</strong>
          <span>{p.name}</span>
        </div>
      </div>
      <h1 className="lw-tagline" data-testid="tessera-titolo">
        {productHeadline(product)}
      </h1>
      {p.kind === "abbonamento" ? (
        <p className="lw-lead">
          Crea la tessera qui, poi paga l&apos;abbonamento in cassa: lo attiviamo subito e lo mostri a ogni visita.
          {p.validityMonths
            ? ` Vale ${p.validityMonths} mesi dall'attivazione; il rinnovo in negozio allunga dalla scadenza.`
            : ""}
        </p>
      ) : (
        <p className="lw-lead">
          Crea la tessera qui, poi pagala in cassa: la attiviamo subito e a ogni utilizzo scaliamo le {p.unitPlural}{" "}
          usate.
          {p.validityMonths ? ` Vale ${p.validityMonths} mesi dall'attivazione.` : ""}
        </p>
      )}
    </header>
  );
  return (
    <main className="lw-page">
      <style dangerouslySetInnerHTML={{ __html: themeCss(shop.hex_color) }} />
      <EnrollFlow shop={view} product={p} siteKey={requireEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY")} header={header} />
    </main>
  );
}
