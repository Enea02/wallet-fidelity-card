import { View } from "react-native";
import { Icon } from "./Icon";
import { T } from "./Text";
import { radius, space, useTheme } from "./theme";

/** Conferma verde in alto (es. "Timbro aggiunto"), sparisce da sola dopo 2,5 secondi. */
export function Toast({ title, body }: { title: string; body: string }) {
  const t = useTheme();
  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      testID="toast"
      style={{
        position: "absolute",
        top: space.md,
        left: space.lg,
        right: space.lg,
        flexDirection: "row",
        alignItems: "center",
        gap: space.md,
        backgroundColor: t.successSoft,
        borderRadius: radius.button,
        padding: space.md,
        zIndex: 10,
      }}
    >
      <View
        style={{
          width: 28,
          height: 28,
          borderRadius: 14,
          backgroundColor: t.success,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon name="check" color={t.successSoft} size={18} strokeWidth={3} />
      </View>
      <View style={{ flex: 1 }}>
        <T variant="bodyStrong" style={{ color: t.success }}>
          {title}
        </T>
        <T variant="small">{body}</T>
      </View>
    </View>
  );
}
