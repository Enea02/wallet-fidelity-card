import { Pressable, View } from "react-native";
import { Icon } from "./Icon";
import { T } from "./Text";
import { radius, space, useTheme } from "./theme";

/** Valore numerico con − e + (timbri necessari, rettifica del saldo). */
export function Stepper({
  value,
  min,
  max,
  onChange,
  label,
  testID,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  label: string;
  testID?: string;
}) {
  const t = useTheme();
  const btn = (dir: -1 | 1) => {
    const disabled = dir < 0 ? value <= min : value >= max;
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${dir < 0 ? "Diminuisci" : "Aumenta"} ${label}`}
        accessibilityState={{ disabled }}
        disabled={disabled}
        {...(testID !== undefined && { testID: `${testID}-${dir < 0 ? "meno" : "piu"}` })}
        onPress={() => onChange(value + dir)}
        style={({ pressed }) => ({
          width: 44,
          height: 44,
          borderRadius: radius.field,
          borderWidth: 1,
          borderColor: t.line,
          backgroundColor: pressed ? t.surface2 : t.surface,
          alignItems: "center",
          justifyContent: "center",
          opacity: disabled ? 0.4 : 1,
        })}
      >
        <Icon name={dir < 0 ? "minus" : "plus"} color={t.ink} size={20} />
      </Pressable>
    );
  };
  return (
    <View
      style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}
      accessibilityRole="adjustable"
      accessibilityLabel={`${label}: ${value}`}
    >
      {btn(-1)}
      <T
        variant="subtitle"
        style={{ minWidth: 44, textAlign: "center", fontVariant: ["tabular-nums"], fontSize: 24 }}
        {...(testID !== undefined && { testID: `${testID}-valore` })}
      >
        {value}
      </T>
      {btn(1)}
    </View>
  );
}
