import { cardColors } from "@loyalty/shared/theme";
import { router } from "expo-router";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Shop } from "@/lib/session";
import { Icon } from "../Icon";
import { Monogram } from "../Monogram";
import { T } from "../Text";
import { space, useTheme } from "../theme";

/** Intestazione su mobile: negozio attivo e, per il titolare, accesso al profilo (non è tra le tab). */
export function TopBar({ shop, showProfile }: { shop: Shop; showProfile: boolean }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const c = cardColors(shop.hexColor.toUpperCase());
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: space.md,
        paddingTop: insets.top + space.sm,
        paddingBottom: space.sm,
        paddingHorizontal: space.lg,
        backgroundColor: t.bg,
        borderBottomWidth: 1,
        borderBottomColor: t.line,
      }}
    >
      <Monogram name={shop.name} logoUrl={shop.logoUrl} bg={c.bg} fg={c.fg} size={32} />
      <T variant="bodyStrong" numberOfLines={1} style={{ flex: 1 }}>
        {shop.name}
      </T>
      {showProfile ? (
        // il titolare non ha lo scanner tra le tab (design T2): sempre a un tocco da qui
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Scansiona una carta"
          testID="apri-scanner"
          onPress={() => router.navigate("/scanner")}
          style={({ pressed }) => ({
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            height: 40,
            paddingHorizontal: space.md,
            borderRadius: 20,
            backgroundColor: pressed ? t.accentEdge : t.accent,
          })}
        >
          <Icon name="scan" color={t.onAccent} size={18} />
          <T variant="small" style={{ color: t.onAccent }}>
            Scansiona
          </T>
        </Pressable>
      ) : null}
      {showProfile ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Profilo"
          testID="apri-profilo"
          hitSlop={8}
          onPress={() => router.navigate("/profilo")}
          style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}
        >
          <Icon name="profile" color={t.ink} size={26} />
        </Pressable>
      ) : null}
    </View>
  );
}
