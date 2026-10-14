import type { StampIcon } from "@loyalty/shared/theme";
import { useEffect, useRef } from "react";
import { AccessibilityInfo, Animated, View } from "react-native";
import { Banner } from "@/ui/Banner";
import { Button } from "@/ui/Button";
import { Card } from "@/ui/Card";
import { SupportCode } from "@/ui/SupportCode";
import { T } from "@/ui/Text";
import { fonts, space, useTheme } from "@/ui/theme";
import { StampGrid } from "./StampGrid";
import { clientSince, mmss, stampsLabel, visitsLabel, type CardState } from "./state";

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join("");

export interface CustomerCardProps {
  state: CardState;
  can: { stamp: boolean; redeem: boolean; undo: boolean; undoSecondsLeft: number };
  stampIcon: StampIcon;
  online: boolean;
  onStamp: () => void;
  onRedeem: () => void;
  onUndo: () => void;
  onNext: () => void;
  onDismissError: () => void;
}

/**
 * Scheda cliente (design Staff S3): chi è, saldo e griglia, azioni grandi nella metà bassa.
 * Solo presentazione: lo stato arriva da useCardActions (testata nei vari stati).
 */
export function CustomerCard({
  state,
  can,
  stampIcon,
  online,
  onStamp,
  onRedeem,
  onUndo,
  onNext,
  onDismissError,
}: CustomerCardProps) {
  const t = useTheme();
  const { card, since, visits } = state.data;
  // il saldo "batte" quando cambia (design 05 · Movimento); niente con "riduci movimento"
  const pulse = useRef(new Animated.Value(1)).current;
  const previous = useRef(card.stamps);
  useEffect(() => {
    if (previous.current === card.stamps) return;
    previous.current = card.stamps;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (reduce) return;
      pulse.setValue(1.35);
      Animated.spring(pulse, { toValue: 1, friction: 4, tension: 160, useNativeDriver: true }).start();
    });
  }, [card.stamps, pulse]);
  return (
    <View style={{ flex: 1, gap: space.lg }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
        <View
          style={{
            width: 48,
            height: 48,
            borderRadius: 24,
            backgroundColor: t.accentSoft,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <T style={{ color: t.accentText, fontFamily: fonts.bold }}>{initials(card.name)}</T>
        </View>
        <View style={{ flex: 1 }}>
          <T variant="subtitle" testID="nome-cliente" numberOfLines={1}>
            {card.name}
          </T>
          <T variant="small" tone="ink2">
            {clientSince(since)} · {visitsLabel(visits)}
          </T>
        </View>
      </View>

      <Card style={{ gap: space.md }}>
        <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" }}>
          <T variant="label" tone="ink2">
            TIMBRI
          </T>
          <Animated.View style={{ transform: [{ scale: pulse }] }}>
            <T testID="saldo-timbri" accessibilityLabel={stampsLabel(card.stamps, card.stampsRequired)}>
              <T variant="number" style={{ fontSize: 44, lineHeight: 48 }}>
                {card.stamps}
              </T>
              <T variant="subtitle" tone="ink2">
                /{card.stampsRequired}
              </T>
            </T>
          </Animated.View>
        </View>
        <StampGrid n={card.stampsRequired} filled={card.stamps} icon={stampIcon} />
        {card.rewardsAvailable > 0 ? (
          <View
            style={{
              backgroundColor: t.accentSoft,
              borderRadius: 999,
              paddingHorizontal: space.md,
              paddingVertical: 6,
              alignSelf: "flex-start",
            }}
          >
            <T variant="small" style={{ color: t.accentText, fontFamily: fonts.semibold }} testID="premi-disponibili">
              {card.rewardsAvailable === 1 ? "1 premio disponibile" : `${card.rewardsAvailable} premi disponibili`}:{" "}
              {card.rewardLabel}
            </T>
          </View>
        ) : null}
      </Card>

      {state.error ? (
        <Banner tone="danger">
          <T variant="small" testID="messaggio-errore">
            {state.error.userMessage}
          </T>
          {state.error.supportCode ? <SupportCode code={state.error.supportCode} /> : null}
          <Button
            label="Ok"
            variant="ghost"
            onPress={onDismissError}
            style={{ alignSelf: "flex-start", paddingHorizontal: 0 }}
          />
        </Banner>
      ) : null}
      {!online ? <Banner tone="warning">Senza rete non si possono dare timbri né riscattare premi.</Banner> : null}

      <View style={{ marginTop: "auto", gap: space.md }}>
        <View style={{ flexDirection: "row", gap: space.md }}>
          <Button
            label="+1 timbro"
            size="lg"
            onPress={onStamp}
            disabled={!can.stamp}
            loading={state.busy === "stamp"}
            style={{ flex: 1, minHeight: 88 }}
            testID="aggiungi-timbro"
          />
          <Button
            label="Riscatta premio"
            size="lg"
            variant="secondary"
            onPress={onRedeem}
            disabled={!can.redeem}
            loading={state.busy === "redeem"}
            style={{ flex: 1, minHeight: 88, opacity: can.redeem || state.busy === "redeem" ? 1 : 0.5 }}
            testID="riscatta-premio"
          />
        </View>
        {can.undo || state.busy === "undo" ? (
          <Button
            label={`Annulla ultimo timbro · ${mmss(can.undoSecondsLeft)}`}
            variant="secondary"
            onPress={onUndo}
            loading={state.busy === "undo"}
            disabled={!can.undo}
            style={{ borderStyle: "dashed" }}
            testID="annulla-timbro"
          />
        ) : null}
        <Button label="Cliente successivo" variant="secondary" onPress={onNext} testID="cliente-successivo" />
      </View>
    </View>
  );
}
