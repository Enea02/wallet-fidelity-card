import { View, type ViewProps } from "react-native";
import { radius, space, useTheme } from "./theme";

export function Card({ style, ...rest }: ViewProps) {
  const t = useTheme();
  return (
    <View
      {...rest}
      style={[
        {
          backgroundColor: t.surface,
          borderColor: t.line,
          borderWidth: 1,
          borderRadius: radius.card,
          padding: space.lg,
          gap: space.md,
        },
        style,
      ]}
    />
  );
}
