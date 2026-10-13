import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { getShopBySlug } from "@/lib/loyalty";
import { requireEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

/** Cartello da stampare per il bancone: QR verso la pagina di iscrizione. */
export default async function CounterQr({ params }: { params: Promise<{ shop: string }> }) {
  const { shop: slug } = await params;
  const shop = await getShopBySlug(slug);
  if (!shop) notFound();

  const url = `${requireEnv("APP_BASE_URL")}/${shop.slug}`;
  const svg = await QRCode.toString(url, { type: "svg", margin: 1, width: 320 });

  return (
    <main style={{ textAlign: "center" }}>
      <h1>{shop.name}</h1>
      <p style={{ fontSize: "1.2rem" }}>
        Inquadra e ottieni la carta fedeltà
        <br />
        <strong>
          ogni {shop.stamps_required} visite: {shop.reward_label.toLowerCase()}
        </strong>
      </p>
      <div style={{ background: "#fff", padding: 16, borderRadius: 16, display: "inline-block" }}
        dangerouslySetInnerHTML={{ __html: svg }} />
      <p className="muted">{url}</p>
    </main>
  );
}
