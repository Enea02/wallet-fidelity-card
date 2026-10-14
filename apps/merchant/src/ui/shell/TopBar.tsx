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
