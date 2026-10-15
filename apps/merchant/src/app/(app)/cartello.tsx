import { taglineFor } from "@loyalty/shared/copy";
import { useState } from "react";
import { useWindowDimensions, View } from "react-native";
import { pdfActions } from "@/features/owner/counter-qr/pdf";
import { SignPreview } from "@/features/owner/counter-qr/SignPreview";
import { LoadState } from "@/features/owner/Loading";
import { useApi } from "@/features/owner/useApi";
import { api, ApiError } from "@/lib/api";
import { config } from "@/lib/config";
import { useOnline } from "@/lib/network";
import { useShop } from "@/lib/session";
import { Banner } from "@/ui/Banner";
import { Button } from "@/ui/Button";
import { ErrorNotice } from "@/ui/ErrorNotice";
import { Screen } from "@/ui/Screen";
import { T } from "@/ui/Text";
import { space } from "@/ui/theme";

/**
 * Cartello A5 da bancone con il QR di iscrizione: anteprima, condivisione/salvataggio del PDF
 * e stampa. Il PDF lo genera il backend (counter_qr.downloaded a ogni scaricamento).
 */
export default function Cartello() {
  const shop = useShop();
  const online = useOnline();
  const { width } = useWindowDimensions();
  const settings = useApi("settings", { shopId: shop.id });
  const [busy, setBusy] = useState<"share" | "print" | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const s = settings.data?.settings;
  const file = `cartello-${shop.slug}.pdf`;

  async function run(kind: "share" | "print") {
    setBusy(kind);
    setError(null);
    setDone(null);
    try {
      const pdf = await api.call("counterQr", { shopId: shop.id });
      if (kind === "share") await pdfActions.share(pdf, file);
      else await pdfActions.print(pdf, file);
      if (kind === "share" && !pdfActions.canShare) setDone(`Scaricato ${file}: aprilo per stamparlo in A5.`);
    } catch (e) {
      if (!(e instanceof ApiError)) throw e;
      setError(e);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Screen maxWidth={980}>
      <T variant="title" accessibilityRole="header">
        Cartello da bancone
      </T>
      <T tone="ink2">
        Stampalo in A5 e mettilo vicino alla cassa: i clienti inquadrano il QR e si iscrivono da soli, senza app.
      </T>
      {!s ? (
        <LoadState error={settings.error} onRetry={() => void settings.reload()} />
      ) : (
        <View style={{ flexDirection: width >= 900 ? "row" : "column", gap: space.xl, alignItems: "flex-start" }}>
          <View style={{ flex: 1, width: "100%", alignItems: "center" }}>
            <SignPreview
              name={s.name}
              program={s.programName}
              tagline={taglineFor(s)}
              hexColor={s.hexColor}
              logoUrl={s.logoUrl}
              stampsRequired={s.stampsRequired}
              url={`${config.apiUrl}/${s.slug}`}
            />
          </View>
          <View style={{ flex: 1, width: "100%", gap: space.md }}>
            <Button
              label={pdfActions.canShare ? "Condividi o salva il PDF" : "Scarica il PDF"}
              onPress={() => void run("share")}
              loading={busy === "share"}
              disabled={!online || busy !== null}
              testID="scarica-cartello"
            />
            <Button
              label="Stampa"
              variant="secondary"
              onPress={() => void run("print")}
              loading={busy === "print"}
              disabled={!online || busy !== null}
              testID="stampa-cartello"
            />
            {done ? <Banner tone="success">{done}</Banner> : null}
            {error ? <ErrorNotice error={error} /> : null}
            <T variant="small" tone="ink2">
              Il cartello usa il colore, il logo e il premio della carta: se li cambi in "Carta", scaricalo di nuovo.
            </T>
          </View>
        </View>
      )}
    </Screen>
  );
}
