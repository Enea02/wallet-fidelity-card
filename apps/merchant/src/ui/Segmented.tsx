import { Pressable, useWindowDimensions, View } from "react-native";
import { Icon, type IconName } from "./Icon";
import { T } from "./Text";
import { radius, space, useTheme } from "./theme";

export interface Segment<K extends string> {
  key: K;
  label: string;
  icon?: IconName;
}

/** Scelta tra poche opzioni (es. modalità dello scanner). */
export function Segmented<K extends string>({
  value,
  options,
  onChange,
  testID,
}: {
  value: K;
  options: Segment<K>[];
  onChange: (k: K) => void;
  testID?: string;
}) {
  const t = useTheme();
  // sugli schermi stretti solo il testo, così le etichette restano intere
  const showIcons = useWindowDimensions().width >= 420;
  return (
    <View
      accessibilityRole="tablist"
      {...(testID !== undefined && { testID })}
      style={{ flexDirection: "row", backgroundColor: t.surface2, borderRadius: radius.button, padding: 4, gap: 4 }}
    >
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Pressable
            key={o.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            testID={`modalita-${o.key}`}
            onPress={() => onChange(o.key)}
            style={{
              flex: 1,
              minHeight: 44,
              borderRadius: radius.field,
              backgroundColor: on ? t.surface : "transparent",
              borderWidth: on ? 1 : 0,
              borderColor: t.line,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: space.sm,
              paddingHorizontal: space.sm,
            }}
          >
            {o.icon && showIcons ? <Icon name={o.icon} color={on ? t.accentText : t.ink2} size={18} /> : null}
            <T variant="small" style={{ color: on ? t.ink : t.ink2 }} numberOfLines={1}>
              {o.label}
            </T>
          </Pressable>
        );
      })}
    </View>
  );
}
