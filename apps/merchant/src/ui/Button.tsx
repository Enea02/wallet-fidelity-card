import { ActivityIndicator, Pressable, View, type PressableProps, type StyleProp, type ViewStyle } from "react-native";
import { T } from "./Text";
import { fonts, radius, space, useTheme } from "./theme";

export interface ButtonProps extends Omit<PressableProps, "children" | "style"> {
  label: string;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  /** "md" 56 px (moduli), "lg" 72 px (azioni dello staff alla cassa). */
  size?: "md" | "lg";
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  /** Colore del testo su sfondi diversi dal tema (es. schermata del premio nel colore della carta). */
  labelColor?: string;
}

export function Button({
  label,
  variant = "primary",
  size = "md",
  loading,
  disabled,
  style,
  labelColor,
  ...rest
}: ButtonProps) {
  const t = useTheme();
  const off = disabled || loading;
  const palette = {
    primary: { bg: t.accent, fg: t.onAccent, border: t.accentEdge },
    secondary: { bg: t.surface, fg: t.ink, border: t.line },
    ghost: { bg: "transparent", fg: t.accentText, border: "transparent" },
    danger: { bg: t.surface, fg: t.danger, border: t.line },
  }[variant];
  if (labelColor) palette.fg = labelColor;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      disabled={off}
      {...rest}
      style={({ pressed }) => [
        {
          minHeight: size === "lg" ? 72 : variant === "ghost" ? 44 : 56,
          borderRadius: radius.button,
          borderWidth: 1,
          borderColor: off && variant === "primary" ? t.line : palette.border,
          backgroundColor: off && variant === "primary" ? t.surface2 : palette.bg,
          paddingHorizontal: space.lg,
          alignItems: "center",
          justifyContent: "center",
          opacity: pressed ? 0.85 : 1,
          transform: [{ scale: pressed ? 0.98 : 1 }],
        },
        style,
      ]}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
        {loading ? <ActivityIndicator color={off && variant === "primary" ? t.ink2 : palette.fg} /> : null}
        <T
          variant="bodyStrong"
          style={{
            color: off && variant === "primary" ? t.ink2 : palette.fg,
            fontSize: size === "lg" ? 19 : 17,
            fontFamily: fonts.semibold,
            textDecorationLine: variant === "ghost" ? "underline" : "none",
          }}
        >
          {label}
        </T>
      </View>
    </Pressable>
  );
}
