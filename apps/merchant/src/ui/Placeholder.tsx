import { View } from "react-native";
import type { ReactNode } from "react";
import { Card } from "./Card";
import { Icon, type IconName } from "./Icon";
import { Screen } from "./Screen";
import { T } from "./Text";
import { radius, space, useTheme } from "./theme";

/** Sezione non ancora disponibile: titolo, cosa conterrà e un'etichetta "In arrivo". */
export function Placeholder({
  title,
  icon,
  children,
  intro,
}: {
  title: string;
  icon: IconName;
  children: string;
  intro?: ReactNode;
}) {
  const t = useTheme();
  return (
    <Screen maxWidth={880}>
      <T variant="title" accessibilityRole="header">
        {title}
      </T>
      {intro}
      <Card style={{ alignItems: "flex-start", gap: space.md, padding: space.xl }}>
        <View
          style={{
            width: 48,
            height: 48,
            borderRadius: 24,
            backgroundColor: t.accentSoft,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name={icon} color={t.accentText} size={24} />
        </View>
        <View
          style={{ backgroundColor: t.surface2, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 2 }}
        >
          <T variant="label" tone="ink2">
            IN ARRIVO
          </T>
        </View>
        <T tone="ink2">{children}</T>
      </Card>
    </Screen>
  );
}
