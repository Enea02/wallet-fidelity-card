import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "./Icon";
import { T } from "./Text";
import { space, useTheme } from "./theme";

/** Banner fisso "Sei offline" (brief, Fase 6 punto 9). */
export function OfflineBanner() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      accessibilityRole="alert"
      testID="banner-offline"
      style={{
        backgroundColor: t.ink,
        paddingTop: insets.top + space.sm,
        paddingBottom: space.sm,
        paddingHorizontal: space.lg,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: space.sm,
      }}
    >
      <Icon name="offline" color={t.bg} size={18} />
      <T variant="small" style={{ color: t.bg }}>
        Sei offline: le azioni che richiedono la connessione sono sospese.
      </T>
    </View>
  );
}
