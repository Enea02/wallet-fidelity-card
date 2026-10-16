import type { Metadata } from "next";
import { requireEnv } from "@/lib/env";
import { getShopBySlug } from "@/lib/loyalty";
import { log } from "@/lib/observability/logger";
import { activeProducts } from "@/lib/prepaid";
import { publicShop, stripUrl } from "@/lib/public/shop-view";
import { themeCss } from "@/lib/public/theme-style";
import { StatusScreen } from "../_components/StatusScreen";
import { EnrollFlow } from "./EnrollFlow";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ shop: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const shop = await getShopBySlug((await params).shop);
  return shop ? { title: `${shop.name} · ${shop.program_name}` } : { title: "Carta fedeltà" };
}

/** Pagina di iscrizione del negozio (raggiunta dal QR del bancone). */
export default async function EnrollPage({ params }: Props) {
  const { shop: slug } = await params;
  const shop = await getShopBySlug(slug);

  if (!shop) {
    log.event("enroll.shop.unavailable", { slug, reason: "inesistente" });
    const host = requireEnv("APP_BASE_URL")
      .replace(/^https?:\/\//, "")
      .replace(/\/$/, "");
    return (
      <StatusScreen title="Qui non c'è nessuna carta">
        <p className="lw-lead">
          Il link <strong>{`${host}/${slug}`}</strong> non corrisponde a nessun negozio. Forse c&apos;è un errore di
          battitura, oppure il programma è stato chiuso.
        </p>
        <p className="lw-lead">Inquadra di nuovo il QR al bancone o chiedi il link al negozio.</p>
      </StatusScreen>
    );
  }
  if (shop.status !== "active") {
    log.event("enroll.shop.unavailable", { slug, reason: "sospeso" });
    return (
      <StatusScreen title="Carta momentaneamente non disponibile" brand={shop.hex_color}>
        <p className="lw-lead">
          Le iscrizioni alla carta fedeltà di <strong>{shop.name}</strong> sono sospese. Chi ha già la carta la ritrova
          nel Wallet appena il servizio riprende.
        </p>
        <p className="lw-lead">Chiedi informazioni in negozio.</p>
      </StatusScreen>
    );
  }

  const view = publicShop(shop);
  const products = await activeProducts(shop.id);
  const productLinks =
    products.length > 0 ? (
      <nav className="lw-lead" aria-label="Tessere prepagate" data-testid="tessere">
        {shop.loyalty_enabled ? "Cerchi una tessera prepagata? " : "Scegli la tessera: "}
        {products.map((p, i) => (
          <span key={p.id}>
            {i > 0 ? " · " : ""}
            <a href={`/${shop.slug}/t/${p.code}`}>
              {p.name} ({p.units} {p.units === 1 ? p.unit_singular : p.unit_plural})
            </a>
          </span>
        ))}
      </nav>
    ) : null;

  // negozio con sole tessere prepagate (Fase 9.5): niente carta fedeltà, solo la scelta della tessera
  if (!shop.loyalty_enabled) {
    return (
      <main className="lw-page">
        <style dangerouslySetInnerHTML={{ __html: themeCss(shop.hex_color) }} />
        <header className="lw-hero">
          <div className="lw-brand">
            {/* eslint-disable-next-line @next/next/no-img-element -- logo o monogramma generato */}
            <img src={view.logo} alt="" width={52} height={52} />
            <div>
              <strong>{view.name}</strong>
            </div>
          </div>
          <h1 className="lw-tagline">Le tessere di {view.name} sul tuo telefono.</h1>
          {productLinks ?? <p className="lw-lead">Al momento non ci sono tessere disponibili: chiedi in negozio.</p>}
        </header>
      </main>
    );
  }

  // intestazione del negozio resa dal server (design A1): è il contenuto principale della pagina
  const header = (
    <header className="lw-hero">
      <div className="lw-brand">
        {/* eslint-disable-next-line @next/next/no-img-element -- logo o monogramma generato */}
        <img src={view.logo} alt="" width={52} height={52} />
        <div>
          <strong>{view.name}</strong>
          <span>{view.programName}</span>
        </div>
      </div>
      <h1 className="lw-tagline">{view.tagline}</h1>
      {/* eslint-disable-next-line @next/next/no-img-element -- SVG generato */}
      <img
        className="lw-strip"
        src={stripUrl(view, 0)}
        alt={`Carta da ${view.stampsRequired} timbri`}
        width={1032}
        height={336}
        fetchPriority="high"
      />
      {productLinks}
    </header>
  );
  return (
    <main className="lw-page">
      <style dangerouslySetInnerHTML={{ __html: themeCss(shop.hex_color) }} />
      <EnrollFlow shop={view} siteKey={requireEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY")} header={header} />
    </main>
  );
}
