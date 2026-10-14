import { gridLayout, strip, type StampIcon } from "@loyalty/shared/theme";
import { useState } from "react";
import { View } from "react-native";
import { SvgXml } from "react-native-svg";
import { useTheme } from "@/ui/theme";
import { stampsLabel } from "./state";

/**
 * Griglia dei timbri "su superficie" (design 03 · Timbri): stesso disegno della carta nel wallet
 * (packages/shared/theme.ts, strip) con i colori del tema dell'app. L'ultimo posto è il premio.
 */
export function StampGrid({ n, filled, icon }: { n: number; filled: number; icon: StampIcon }) {
  const t = useTheme();
  const [w, setW] = useState(0);
  const rows = gridLayout(n).rows;
  const h = Math.round(w * (rows === 1 ? 0.22 : 0.44));
  return (
    <View
      onLayout={(e) => setW(Math.round(e.nativeEvent.layout.width))}
      style={{ width: "100%", height: h || undefined, aspectRatio: w ? undefined : rows === 1 ? 4.5 : 2.3 }}
      accessibilityRole="image"
      accessibilityLabel={stampsLabel(filled, n)}
      testID="griglia-timbri"
    >
      {w > 0 ? (
        <SvgXml
          xml={strip({
            n,
            filled,
            w,
            h,
            fg: t.accent,
            ring: t.ink3,
            bg: t.surface,
            icon,
            numbers: true,
            transparent: true,
            padX: 0,
            padY: 4,
          })}
          width={w}
          height={h}
        />
      ) : null}
    </View>
  );
}
