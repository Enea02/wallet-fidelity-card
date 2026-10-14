import { Redirect, router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef } from "react";
import { View } from "react-native";
import { CustomerCard } from "@/features/card/CustomerCard";
import { RewardCelebration } from "@/features/card/RewardCelebration";
import { useCardActions } from "@/features/card/useCardActions";
import { scannedFor, type ScannedCard } from "@/features/scan/session";
import { useSound } from "@/features/scan/useSound";
import { log } from "@/lib/diagnostics/logger";
import { useOnline } from "@/lib/network";
import { useShop } from "@/lib/session";
import { Button } from "@/ui/Button";
import { Screen } from "@/ui/Screen";
import { Sheet } from "@/ui/Sheet";
import { T } from "@/ui/Text";
import { Toast } from "@/ui/Toast";
import { space } from "@/ui/theme";

/** Scheda cliente dopo una lettura. Senza lettura (es. pagina ricaricata sul web) si torna allo scanner. */
export default function Cliente() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const scanned = scannedFor(String(id));
  if (!scanned) return <Redirect href="/scanner" />;
  return <CardScreen scanned={scanned} />;
}

function CardScreen({ scanned }: { scanned: ScannedCard }) {
  const shop = useShop();
  const online = useOnline();
  const [sound] = useSound();
  const a = useCardActions(shop, scanned, sound, online);
  const { state } = a;
  const shown = useRef(false);

  useEffect(() => {
    if (shown.current) return;
    shown.current = true;
    log.event("scan.card.shown", {
      customer_ref: scanned.data.card.shortCode,
      mode: scanned.mode,
      duration_ms: Date.now() - scanned.scannedAt,
    });
  }, [scanned]);

  const next = () => (router.canGoBack() ? router.back() : router.replace("/scanner"));
  const first = state.data.card.name.trim().split(/\s+/)[0] ?? "";

  return (
    <View style={{ flex: 1 }}>
      <Screen fill maxWidth={560}>
        <CustomerCard
          state={state}
          can={a.can}
          stampIcon={shop.stampIcon}
          online={online}
          onStamp={() => void a.stamp()}
          onRedeem={a.askRedeem}
          onUndo={() => void a.undo()}
          onNext={next}
          onDismissError={a.dismissError}
        />
      </Screen>
      {state.toast ? <Toast title={state.toast.title} body={state.toast.body} /> : null}

      <Sheet visible={state.cooldown !== null} onClose={a.closeSheets} testID="foglio-cooldown">
        <T variant="subtitle">Timbro già dato da poco</T>
        <T tone="ink2">{state.cooldown?.userMessage}</T>
        <Button label="Ok, niente timbro" onPress={a.closeSheets} testID="niente-timbro" />
        <Button
          label="Aggiungi comunque (resta nel registro)"
          variant="ghost"
          onPress={() => void a.stamp(true)}
          disabled={!online}
          testID="aggiungi-comunque"
          style={{ alignSelf: "center" }}
        />
      </Sheet>

      <Sheet visible={state.confirmRedeem} onClose={a.closeSheets} testID="foglio-riscatto">
        <T variant="subtitle">Riscattare {state.data.card.rewardLabel.toLowerCase()}?</T>
        <T tone="ink2">
          Per {state.data.card.name}. Il premio viene segnato come usato e la carta nel wallet si aggiorna da sola.
        </T>
        <View style={{ gap: space.md }}>
          <Button
            label="Sì, riscatta"
            onPress={() => void a.redeem()}
            loading={state.busy === "redeem"}
            disabled={!online}
            testID="conferma-riscatto"
          />
          <Button label="Annulla" variant="secondary" onPress={a.closeSheets} />
        </View>
      </Sheet>

      <RewardCelebration
        visible={state.celebration}
        hexColor={shop.hexColor}
        stampsRequired={state.data.card.stampsRequired}
        customerName={first}
        rewardLabel={state.data.card.rewardLabel}
        busy={state.busy === "redeem"}
        onRedeem={a.askRedeem}
        onLater={a.closeSheets}
      />
    </View>
  );
}
