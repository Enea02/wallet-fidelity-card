import { cardColors, STAMP_ICONS } from "@loyalty/shared/theme";
import { useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, Modal, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SvgXml } from "react-native-svg";
import { Button } from "@/ui/Button";
import { T } from "@/ui/Text";
import { fonts, space } from "@/ui/theme";

/*
 * Premio sbloccato (design Staff S4, 05 · Movimento): schermata intera nel colore della carta,
 * rosetta che entra ruotando, 18 coriandoli dal centro. Con "riduci movimento" solo dissolvenza.
 */

function rosette(fg: string, bg: string): string {
  let d = "";
  for (let k = 0; k <= 120; k++) {
    const a = (2 * Math.PI * k) / 120;
    const r = 46 * (0.9 + 0.1 * Math.cos(12 * a));
    d += `${k ? "L" : "M"}${(50 + r * Math.cos(a)).toFixed(2)} ${(50 + r * Math.sin(a)).toFixed(2)}`;
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="${d}Z" fill="${fg}"/>` +
    `<g transform="translate(26 26) scale(2)" fill="none" stroke="${bg}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${STAMP_ICONS.gift}</g></svg>`
  );
}

function Confetti({ colors }: { colors: [string, string] }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: 18 }, (_, i) => {
        const angle = (i / 18) * Math.PI * 2 + (i % 3) * 0.2;
        const dist = 120 + (i % 5) * 28;
        return { dx: Math.cos(angle) * dist, dy: Math.sin(angle) * dist, square: i % 2 === 0, color: colors[i % 2]! };
      }),
    [colors],
  );
  const p = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(p, { toValue: 1, duration: 1100, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [p]);
  return (
    <View pointerEvents="none" style={{ position: "absolute", left: "50%", top: "40%" }}>
      {pieces.map((c, i) => (
        <Animated.View
          key={i}
          style={{
            position: "absolute",
            width: 10,
            height: 10,
            borderRadius: c.square ? 2 : 5,
            backgroundColor: c.color,
            opacity: p.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 1, 0] }),
            transform: [
              { translateX: p.interpolate({ inputRange: [0, 1], outputRange: [0, c.dx] }) },
              { translateY: p.interpolate({ inputRange: [0, 1], outputRange: [0, c.dy] }) },
              { rotate: p.interpolate({ inputRange: [0, 1], outputRange: ["0deg", `${(i % 2 ? 1 : -1) * 220}deg`] }) },
            ],
          }}
        />
      ))}
    </View>
  );
}

export interface RewardCelebrationProps {
  visible: boolean;
  hexColor: string;
  stampsRequired: number;
  customerName: string;
  rewardLabel: string;
  busy: boolean;
  onRedeem: () => void;
  onLater: () => void;
}

export function RewardCelebration(p: RewardCelebrationProps) {
  const insets = useSafeAreaInsets();
  const c = cardColors(p.hexColor.toUpperCase());
  const [reduceMotion, setReduceMotion] = useState(false);
  const enter = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
  }, []);
  useEffect(() => {
    if (!p.visible) {
      enter.setValue(0);
      return;
    }
    Animated.timing(enter, {
      toValue: 1,
      duration: reduceMotion ? 150 : 700,
      easing: reduceMotion ? Easing.linear : Easing.bezier(0.2, 0.9, 0.3, 1.2),
      useNativeDriver: true,
    }).start();
  }, [p.visible, reduceMotion, enter]);

  const first = p.customerName.trim().split(/\s+/)[0] ?? p.customerName;
  return (
    <Modal visible={p.visible} animationType="fade" onRequestClose={p.onLater} statusBarTranslucent>
      <View
        testID="premio-sbloccato"
        style={{
          flex: 1,
          backgroundColor: c.bg,
          paddingTop: insets.top + space.xxxl,
          paddingBottom: insets.bottom + space.xl,
          paddingHorizontal: space.xl,
          alignItems: "center",
        }}
      >
        {p.visible && !reduceMotion ? <Confetti colors={[c.fg, c.label]} /> : null}
        <Animated.View
          style={{
            opacity: enter,
            transform: reduceMotion
              ? []
              : [
                  { scale: enter.interpolate({ inputRange: [0, 1], outputRange: [1.6, 1] }) },
                  { rotate: enter.interpolate({ inputRange: [0, 1], outputRange: ["-20deg", "0deg"] }) },
                ],
          }}
        >
          <SvgXml xml={rosette(c.fg, c.bg)} width={150} height={150} />
        </Animated.View>
        <T style={{ color: c.label, fontFamily: fonts.semibold, marginTop: space.xl }}>
          {p.stampsRequired} timbri su {p.stampsRequired}
        </T>
        <T variant="display" center style={{ color: c.fg, marginTop: space.sm }} accessibilityRole="header">
          Premio sbloccato!
        </T>
        <T center style={{ color: c.fg, marginTop: space.md, maxWidth: 420 }}>
          {first} ha diritto a: <T style={{ color: c.fg, fontFamily: fonts.bold }}>{p.rewardLabel}</T>. Puoi riscattarlo
          subito o alla prossima visita.
        </T>
        <View style={{ marginTop: "auto", width: "100%", maxWidth: 480, gap: space.md }}>
          <Button
            label="Riscatta ora"
            size="lg"
            onPress={p.onRedeem}
            loading={p.busy}
            style={{ backgroundColor: c.fg, borderColor: c.fg }}
            labelColor={c.bg}
            testID="riscatta-ora"
          />
          <Button
            label="Alla prossima visita"
            size="lg"
            variant="secondary"
            onPress={p.onLater}
            style={{ backgroundColor: "transparent", borderColor: c.ring }}
            labelColor={c.fg}
            testID="alla-prossima"
          />
        </View>
      </View>
    </Modal>
  );
}
