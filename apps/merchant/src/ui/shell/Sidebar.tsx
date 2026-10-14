import { cardColors } from "@loyalty/shared/theme";
import { router } from "expo-router";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { sectionsFor, type SectionKey } from "@/lib/navigation/sections";
import type { Shop } from "@/lib/session";
import { Icon } from "../Icon";
import { Monogram } from "../Monogram";
import { T } from "../Text";
import { radius, space, useTheme } from "../theme";
import { hrefOf, ICON } from "./nav";

const ROLE = { owner: "Titolare", operator: "Operatore" } as const;

function Item({ k, label, active }: { k: SectionKey; label: string; active: boolean }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityState={{ selected: active }}
      testID={`nav-${k}`}
      onPress={() => router.navigate(hrefOf(k))}
      style={(state) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: space.md,
        minHeight: 44,
        paddingHorizontal: space.md,
        borderRadius: radius.field,
        backgroundColor: active
          ? t.accentSoft
          : state.pressed || (state as { hovered?: boolean }).hovered
            ? t.surface2
            : "transparent",
      })}
    >
      <Icon name={ICON[k]} color={active ? t.accentText : t.ink2} size={20} />
      <T variant={active ? "bodyStrong" : "body"} style={{ color: active ? t.accentText : t.ink }}>
        {label}
      </T>
    </Pressable>
  );
}

/** Barra laterale (tablet orizzontale e desktop): negozio in alto, sezioni, profilo in fondo. */
export function Sidebar({ shop, active }: { shop: Shop; active: SectionKey | null }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const c = cardColors(shop.hexColor.toUpperCase());
  const sections = sectionsFor(shop.role).filter((s) => s.key !== "profilo");
  return (
    <View
      role="navigation"
      style={{
        width: 248,
        backgroundColor: t.surface,
        borderRightWidth: 1,
        borderRightColor: t.line,
        paddingTop: insets.top + space.xl,
        paddingBottom: insets.bottom + space.lg,
        paddingHorizontal: space.md,
        gap: space.xl,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.sm }}>
        <Monogram name={shop.name} logoUrl={shop.logoUrl} bg={c.bg} fg={c.fg} size={40} />
        <View style={{ flex: 1 }}>
          <T variant="bodyStrong" numberOfLines={1}>
            {shop.name}
          </T>
          <T variant="small" tone="ink2">
            {ROLE[shop.role]}
          </T>
        </View>
      </View>
      <View style={{ gap: 2 }}>
        {sections.map((s) => (
          <Item key={s.key} k={s.key} label={s.label} active={active === s.key} />
        ))}
      </View>
      <View style={{ marginTop: "auto" }}>
        <Item k="profilo" label={shop.displayName || "Profilo"} active={active === "profilo"} />
      </View>
    </View>
  );
}
