import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { requireEnv } from "@/lib/env";
import { getShopBySlug } from "@/lib/loyalty";
import { publicShop, stripUrl } from "@/lib/public/shop-view";

export const dynamic = "force-dynamic";

/**
 * Cartello A5 da bancone (docs/design/Cartello A5.dc.html), stampabile dal browser;
 * il PDF identico per la tipografia si scarica da /<slug>/qr.pdf.
 */
export default async function CounterQr({ params }: { params: Promise<{ shop: string }> }) {
  const { shop: slug } = await params;
  const shop = await getShopBySlug(slug);
  if (!shop || shop.status !== "active") notFound();

  const view = publicShop(shop);
  const url = `${requireEnv("APP_BASE_URL").replace(/\/$/, "")}/${shop.slug}`;
  const qr = await QRCode.toString(url, { type: "svg", margin: 0, color: { dark: "#1E1915", light: "#FFFFFF" } });
  const steps = ["Inquadra il QR con la fotocamera", "Scrivi nome e telefono", "Salva la carta nel wallet"];

  return (
    <main className="sign-wrap">
      <style>{`
        body{background:#E9E2D8}
        .sign-wrap{display:flex;flex-direction:column;align-items:center;gap:16px;padding:24px 12px}
        .sign-actions{display:flex;gap:12px}
        .sign-actions a,.sign-actions button{height:44px;padding:0 16px;border-radius:12px;border:1px solid #DDD4CA;background:#FEFCF9;color:#2A211C;font:600 15px var(--lw-font),sans-serif;display:inline-flex;align-items:center;text-decoration:none;cursor:pointer}
        .sign{width:148mm;height:210mm;background:${view.card.bg};color:${view.card.fg};display:flex;flex-direction:column;overflow:hidden;box-shadow:0 24px 50px -24px rgba(60,40,20,.45);-webkit-print-color-adjust:exact;print-color-adjust:exact}
        .sign .top{padding:11mm 11mm 0;display:flex;flex-direction:column;gap:6mm}
        .sign .brand{display:flex;align-items:center;gap:4mm}
        .sign .brand img{width:16mm;height:16mm;border-radius:50%;object-fit:cover}
        .sign .brand strong{display:block;font-size:17pt;line-height:1.1}
        .sign .brand span{font-size:11pt;color:${view.card.label}}
        .sign h1{margin:0;font-size:40pt;line-height:.98;font-weight:700;letter-spacing:-.03em;text-wrap:balance}
        .sign .strip{width:calc(100% + 6mm);margin:0 -3mm}
        .sign .panel{margin-top:auto;background:#FBF8F3;color:#2A211C;border-radius:8mm 8mm 0 0;padding:8mm 11mm 9mm;display:grid;grid-template-columns:52mm 1fr;gap:7mm;align-items:center}
        .sign .qr{background:#fff;border:.4mm solid #DDD4CA;border-radius:4mm;padding:3mm}
        .sign .qr svg{width:44mm;height:44mm;display:block}
        .sign .url{font-size:9pt;color:#5E534B;text-align:center;margin-top:2.5mm}
        .sign .steps{display:flex;flex-direction:column;gap:4mm}
        .sign .steps h2{margin:0;font-size:19pt;line-height:1.05;letter-spacing:-.02em}
        .sign ol{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:2.6mm;font-size:12pt;line-height:1.3}
        .sign li{display:flex;gap:3mm;align-items:baseline}
        .sign li b{width:7mm;height:7mm;border-radius:50%;background:${view.card.bg};color:${view.card.fg};display:inline-flex;align-items:center;justify-content:center;font-size:10pt;flex:none;transform:translateY(-.6mm)}
        .sign small{font-size:9pt;color:#5E534B}
        @page{size:A5 portrait;margin:0}
        @media print{body{background:#fff}.sign-actions{display:none}.sign-wrap{padding:0}.sign{box-shadow:none}}
      `}</style>
      <div className="sign-actions">
        <a href={`/${shop.slug}/qr.pdf`}>Scarica PDF</a>
      </div>
      <div className="sign">
        <div className="top">
          <div className="brand">
            {/* eslint-disable-next-line @next/next/no-img-element -- logo o monogramma generato */}
            <img src={view.logo} alt="" />
            <div>
              <strong>{shop.name}</strong>
              <span>{shop.program_name}</span>
            </div>
          </div>
          <h1>{view.tagline}</h1>
          {view.mode === "timbri" && (
            // eslint-disable-next-line @next/next/no-img-element -- SVG generato
            <img className="strip" src={stripUrl(view, Math.round(shop.stamps_required * 0.6))} alt="" />
          )}
        </div>
        <div className="panel">
          <div>
            <div className="qr" role="img" aria-label="QR per iscriversi" dangerouslySetInnerHTML={{ __html: qr }} />
            <div className="url">{url.replace(/^https?:\/\//, "")}</div>
          </div>
          <div className="steps">
            <h2>Niente app da scaricare.</h2>
            <ol>
              {steps.map((t, i) => (
                <li key={t}>
                  <b>{i + 1}</b>
                  <span>{t}</span>
                </li>
              ))}
            </ol>
            <small>Google Wallet e Apple Wallet · Gratis</small>
          </div>
        </div>
      </div>
    </main>
  );
}
