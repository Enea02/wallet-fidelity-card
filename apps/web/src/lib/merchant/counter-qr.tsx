import "server-only";
import { join } from "node:path";
import { Document, Font, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { ActorFields } from "@loyalty/shared/logging/events";
import QRCode from "qrcode";
import { fetchExternal } from "../observability/fetch-external";
import { log } from "../observability/logger";
import { cardColors } from "@loyalty/shared/theme";
import { taglineFor } from "../public/shop-view";
import type { PrepaidProduct, Shop } from "../types";

/*
 * Cartello A5 da bancone (docs/design/Cartello A5.dc.html): fondo nel colore del negozio con
 * logo, beneficio in grande e timbri; pannello chiaro con QR verso /<slug>, URL e i tre passi.
 * La striscia dei timbri è vettoriale; l'immagine dinamica della carta arriva in Fase 11.
 */

// font del design (Bricolage Grotesque, licenza OFL in assets/fonts), inclusi nel deploy da next.config
const fontFile = (w: 400 | 700) => join(process.cwd(), "assets", "fonts", `bricolage-grotesque-latin-${w}-normal.woff`);
Font.register({
  family: "Bricolage",
  fonts: [
    { src: fontFile(400), fontWeight: 400 },
    { src: fontFile(700), fontWeight: 700 },
  ],
});
Font.registerHyphenationCallback((word) => [word]);

const PAPER = "#FBF8F3";
const INK = "#2A211C";
const MUTED = "#5E534B";
const mm = (n: number) => n * 2.8346;

const s = StyleSheet.create({
  page: { fontFamily: "Bricolage", flexDirection: "column" },
  top: { paddingTop: mm(11), paddingHorizontal: mm(11), gap: mm(6) },
  brand: { flexDirection: "row", alignItems: "center", gap: mm(4) },
  logo: { width: mm(16), height: mm(16), borderRadius: mm(8) },
  monogram: { width: mm(16), height: mm(16), borderRadius: mm(8), alignItems: "center", justifyContent: "center" },
  shopName: { fontSize: 17, fontWeight: 700 },
  program: { fontSize: 11, opacity: 0.75 },
  headline: { fontSize: 38, fontWeight: 700, lineHeight: 1.0, letterSpacing: -1 },
  stamps: { flexDirection: "row", flexWrap: "wrap", gap: mm(2.5), marginTop: mm(1) },
  panel: {
    marginTop: "auto",
    backgroundColor: PAPER,
    color: INK,
    borderTopLeftRadius: mm(8),
    borderTopRightRadius: mm(8),
    paddingTop: mm(8),
    paddingBottom: mm(9),
    paddingHorizontal: mm(11),
    flexDirection: "row",
    gap: mm(7),
    alignItems: "center",
  },
  qrBox: { alignItems: "center", gap: mm(2.5), width: mm(52) },
  qrFrame: { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#DDD4CA", borderRadius: mm(4), padding: mm(3) },
  qr: { width: mm(44), height: mm(44) },
  url: { fontSize: 9, color: MUTED },
  steps: { flex: 1, gap: mm(4) },
  stepsTitle: { fontSize: 19, fontWeight: 700, lineHeight: 1.05 },
  step: { flexDirection: "row", gap: mm(3), alignItems: "center" },
  stepNum: { width: mm(7), height: mm(7), borderRadius: mm(3.5), alignItems: "center", justifyContent: "center" },
  stepText: { fontSize: 12, lineHeight: 1.3, flex: 1 },
  footnote: { fontSize: 9, color: MUTED },
});

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join("");

interface SignProps {
  shop: Shop;
  /** Cartello di una tessera prepagata (Fase 9.5): niente timbri, testi della tessera. */
  product: PrepaidProduct | null;
  url: string;
  qrDataUrl: string;
  logo: { data: Buffer; format: "png" | "jpg" } | null;
}

function Sign({ shop, product, url, qrDataUrl, logo }: SignProps) {
  // colori della carta (corretti per il contrasto, come la carta nel Wallet e la pagina di iscrizione)
  const c = cardColors(shop.hex_color.toUpperCase());
  const filled = Math.round(shop.stamps_required * 0.6);
  const dot = shop.stamps_required > 12 ? mm(7) : mm(10);
  return (
    <Document title={`Cartello ${shop.name}`} author="Loyalty Wallet" language="it">
      <Page size="A5" style={[s.page, { backgroundColor: c.bg, color: c.fg }]}>
        <View style={s.top}>
          <View style={s.brand}>
            {logo ? (
              <Image style={s.logo} src={logo} />
            ) : (
              <View style={[s.monogram, { backgroundColor: c.fg }]}>
                <Text style={{ color: c.bg, fontSize: 16, fontWeight: 700 }}>{initials(shop.name)}</Text>
              </View>
            )}
            <View>
              <Text style={s.shopName}>{shop.name}</Text>
              <Text style={[s.program, { color: c.label, opacity: 1 }]}>{product?.name ?? shop.program_name}</Text>
            </View>
          </View>
          <Text style={s.headline}>
            {product
              ? `${product.units} ${product.units === 1 ? product.unit_singular : product.unit_plural} sul telefono. Paghi in negozio, la attiviamo subito.`
              : taglineFor(shop)}
          </Text>
          {!product && (
            <View style={s.stamps}>
              {Array.from({ length: shop.stamps_required }, (_, i) => (
                <View
                  key={i}
                  style={{
                    width: dot,
                    height: dot,
                    borderRadius: dot / 2,
                    borderWidth: 2,
                    borderColor: i < filled ? c.fg : c.ring,
                    backgroundColor: i < filled ? c.fg : "transparent",
                  }}
                />
              ))}
            </View>
          )}
        </View>

        <View style={s.panel}>
          <View style={s.qrBox}>
            <View style={s.qrFrame}>
              <Image style={s.qr} src={qrDataUrl} />
            </View>
            <Text style={s.url}>{url.replace(/^https?:\/\//, "")}</Text>
          </View>
          <View style={s.steps}>
            <Text style={s.stepsTitle}>Niente app da scaricare.</Text>
            {(product
              ? [
                  "Inquadra il QR con la fotocamera",
                  "Crea la tessera e salvala nel wallet",
                  "Paga in cassa: la attiviamo subito",
                ]
              : ["Inquadra il QR con la fotocamera", "Scrivi nome e telefono", "Salva la carta nel wallet"]
            ).map((t, i) => (
              <View key={t} style={s.step}>
                <View style={[s.stepNum, { backgroundColor: c.bg }]}>
                  <Text style={{ color: "#FFFFFF", fontSize: 10, fontWeight: 700 }}>{i + 1}</Text>
                </View>
                <Text style={s.stepText}>{t}</Text>
              </View>
            ))}
            <Text style={s.footnote}>Google Wallet e Apple Wallet · Gratis</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}

/** Logo del negozio per il PDF: PNG o JPEG (react-pdf non legge WebP); altrimenti monogramma. */
async function loadLogo(shop: Shop): Promise<SignProps["logo"]> {
  if (!shop.logo_url) return null;
  const format = /\.png($|\?)/i.test(shop.logo_url) ? "png" : /\.jpe?g($|\?)/i.test(shop.logo_url) ? "jpg" : null;
  if (!format) return null;
  try {
    const res = await fetchExternal({
      provider: "supabase-storage",
      operation: "download del logo",
      url: shop.logo_url,
    });
    return { data: Buffer.from(await res.arrayBuffer()), format };
  } catch {
    return null; // già registrato da external.call.failed: il cartello esce con il monogramma
  }
}

/** PDF del cartello; actor = chi lo scarica dall'app (null = pagina pubblica /<slug>/qr). */
export async function counterQrPdf(
  shop: Shop,
  actor: ActorFields | null,
  product: PrepaidProduct | null = null,
): Promise<Response> {
  const started = performance.now();
  const base = (process.env.APP_BASE_URL ?? "").replace(/\/$/, "");
  const url = product ? `${base}/${shop.slug}/t/${product.code}` : `${base}/${shop.slug}`;
  const [qrDataUrl, logo] = await Promise.all([
    QRCode.toDataURL(url, { margin: 0, width: 600, color: { dark: "#1E1915", light: "#FFFFFF" } }),
    loadLogo(shop),
  ]);
  const pdf = await renderToBuffer(<Sign shop={shop} product={product} url={url} qrDataUrl={qrDataUrl} logo={logo} />);

  const done = { shop_name: shop.name, size_bytes: pdf.length, duration_ms: Math.round(performance.now() - started) };
  if (actor) log.event("counter_qr.downloaded", { ...actor, ...done });
  else log.event("counter_qr.public_downloaded", done);
  return new Response(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="cartello-${shop.slug}${product ? `-${product.code}` : ""}.pdf"`,
      "cache-control": "no-store",
    },
  });
}
