import { View } from "react-native";
import { T } from "@/ui/Text";
import { radius, space, useTheme } from "@/ui/theme";

/** Numero della dashboard (design T2): etichetta, valore grande, nota sulla settimana. */
export function KpiTile({
  label,
  value,
  note,
  testID,
}: {
  label: string;
  value: number;
  note: string;
  testID?: string;
}) {
  const t = useTheme();
  return (
    <View
      {...(testID !== undefined && { testID })}
      accessible
      accessibilityLabel={`${label}: ${value}. ${note}`}
      style={{
        flex: 1,
        minWidth: 150,
        backgroundColor: t.surface,
        borderWidth: 1,
        borderColor: t.line,
        borderRadius: radius.card - 2,
        padding: space.lg + 2,
        gap: 6,
      }}
    >
      <T variant="small" tone="ink2">
        {label}
      </T>
      <T variant="number" style={{ fontSize: 40, lineHeight: 42, letterSpacing: -0.8 }}>
        {value}
      </T>
      <T variant="small" tone="ink2" style={{ fontSize: 13 }}>
        {note}
      </T>
    </View>
  );
}
