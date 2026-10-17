import { Redirect, router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { levelLine, preview, pts } from "@/features/points/state";
import { usePointsActions } from "@/features/points/usePointsActions";
import { scannedPointsFor, type ScannedPoints } from "@/features/scan/session";
import { useSound } from "@/features/scan/useSound";
import { log } from "@/lib/diagnostics/logger";
import { useOnline } from "@/lib/network";
import { useShop } from "@/lib/session";
import { Button } from "@/ui/Button";
import { Card } from "@/ui/Card";
import { ErrorNotice } from "@/ui/ErrorNotice";
import { Screen } from "@/ui/Screen";
import { T } from "@/ui/Text";
import { TextField } from "@/ui/TextField";
import { Toast } from "@/ui/Toast";
import { space } from "@/ui/theme";

/** Scheda della carta a punti dopo una lettura (Fase 9.6). Senza lettura si torna allo scanner. */
export default function Punti() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const scanned = scannedPointsFor(String(id));
  if (!scanned) return <Redirect href="/scanner" />;
  return <PointsScreen scanned={scanned} />;
}

function PointsScreen({ scanned }: { scanned: ScannedPoints }) {
  const shop = useShop();
  const online = useOnline();
  const [sound] = useSound();
  const a = usePointsActions(shop, scanned.card, sound, online);
  const c = a.card;
  const [amount, setAmount] = useState("");
  const p = preview(amount, c);
  const shown = useRef(false);

  useEffect(() => {
    if (shown.current) return;
    shown.current = true;
    log.event("scan.card.shown", {
      customer_ref: scanned.card.shortCode,
      mode: scanned.mode,
      duration_ms: Date.now() - scanned.scannedAt,
    });
  }, [scanned]);

  const next = () => (router.canGoBack() ? router.back() : router.replace("/scanner"));
  const give = async () => {
    if (p.cents === null) return;
    if (await a.add(p.cents)) setAmount("");
  };
  const minutes = Math.floor(a.can.undoSecondsLeft / 60);
  const seconds = String(a.can.undoSecondsLeft % 60).padStart(2, "0");

  return (
    <View style={{ flex: 1 }}>
      <Screen fill maxWidth={560}>
        <View style={{ gap: space.xs }}>
          <T variant="label" tone="ink2">
            CARTA A PUNTI · {c.shortCode}
          </T>
          <T variant="title" testID="punti-nome">
            {c.name}
          </T>
        </View>

        <Card style={{ gap: space.sm, alignItems: "center", paddingVertical: space.xl }} testID="punti-scheda">
          <T variant="number" testID="punti-saldo">
            {pts(c.points)}
          </T>
          <T variant="bodyStrong" center testID="punti-livello">
            {levelLine(c)}
          </T>
          {c.perk ? (
            <T variant="small" tone="ink2" center>
              Vantaggio {c.level}: {c.perk}
            </T>
          ) : null}
        </Card>

        {a.error ? <ErrorNotice error={a.error} /> : null}

        <View style={{ gap: space.md, marginTop: "auto" }}>
          <TextField
            label="Importo dello scontrino (€)"
            value={amount}
            onChangeText={(v) => setAmount(v.replace(/[^0-9.,]/g, ""))}
            keyboardType="decimal-pad"
            placeholder="23,50"
            maxLength={9}
            returnKeyType="done"
            onSubmitEditing={() => void give()}
            testID="punti-importo"
          />
          <T variant="small" tone={p.points > 0 ? "ink" : "ink2"} testID="punti-anteprima">
            {p.hint}
          </T>
          <Button
            label={p.points > 0 ? `Dai ${pts(p.points)}` : "Dai i punti"}
            size="lg"
            onPress={() => void give()}
            disabled={!a.can.add || p.cents === null || p.points === 0}
            loading={a.busy === "points_add"}
            testID="punti-dai"
          />
          {a.can.undo ? (
            <Button
              label={`Annulla ultimi punti (${minutes}:${seconds})`}
              variant="ghost"
              onPress={() => void a.undo()}
              loading={a.busy === "points_undo"}
              testID="punti-annulla"
            />
          ) : null}
          <Button label="Cliente successivo" variant="ghost" onPress={next} testID="cliente-successivo" />
        </View>
      </Screen>
      {a.toast ? <Toast title={a.toast.title} body={a.toast.body} /> : null}
    </View>
  );
}
