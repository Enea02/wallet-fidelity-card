import { Text as RNText, type TextProps } from "react-native";
import { typography, useTheme, type TypeVariant } from "./theme";

type Tone = "ink" | "ink2" | "ink3" | "accentText" | "danger" | "success" | "warning" | "onAccent";

export interface TProps extends TextProps {
  variant?: TypeVariant;
  tone?: Tone;
  center?: boolean;
}

/** Testo del design system: variante tipografica e colore dal tema. */
export function T({ variant = "body", tone = "ink", center, style, ...rest }: TProps) {
  const t = useTheme();
  return (
    <RNText
      {...rest}
      style={[typography[variant], { color: t[tone] }, center ? { textAlign: "center" } : null, style]}
      maxFontSizeMultiplier={1.6}
    />
  );
}
