import { Pressable } from "react-native";
import { T } from "./Text";
import { radius, useTheme } from "./theme";

/** Scelta rapida a pillola (filtri della lista clienti, motivi della rettifica). */
export function Chip({
  label,
  selected,
  onPress,
  testID,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  testID?: string;
}) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      {...(testID !== undefined && { testID })}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 36,
        paddingHorizontal: 12,
        justifyContent: "center",
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: selected ? t.ink : t.line,
        backgroundColor: selected ? t.ink : pressed ? t.surface2 : t.surface,
      })}
    >
      <T variant="small" style={{ color: selected ? t.bg : t.ink, fontWeight: "600" }}>
        {label}
      </T>
    </Pressable>
  );
}
