import { router } from "expo-router";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { sectionsFor, type SectionKey } from "@/lib/navigation/sections";
import type { Role } from "@loyalty/shared/api";
import { Icon } from "../Icon";
import { T } from "../Text";
import { space, useTheme } from "../theme";
import { hrefOf, ICON, TAB_LABEL } from "./nav";

/** Tab in basso su mobile. */
export function TabBar({ role, active }: { role: Role; active: SectionKey | null }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const tabs = sectionsFor(role).filter((s) => s.inTabs);
  return (
    <View
      accessibilityRole="tablist"
      style={{
        flexDirection: "row",
        backgroundColor: t.surface,
        borderTopWidth: 1,
        borderTopColor: t.line,
        paddingBottom: Math.max(insets.bottom, space.sm),
        paddingTop: space.sm,
      }}
    >
      {tabs.map((s) => {
        const on = active === s.key;
        return (
          <Pressable
            key={s.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={s.label}
            testID={`tab-${s.key}`}
            onPress={() => router.navigate(hrefOf(s.key))}
            style={{ flex: 1, alignItems: "center", gap: 2, minHeight: 48, justifyContent: "center" }}
          >
            <Icon name={ICON[s.key]} color={on ? t.accentText : t.ink3} size={22} />
            <T variant="label" style={{ color: on ? t.accentText : t.ink2, letterSpacing: 0 }}>
              {TAB_LABEL[s.key] ?? s.label}
            </T>
          </Pressable>
        );
      })}
    </View>
  );
}
