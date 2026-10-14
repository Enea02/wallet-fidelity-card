import type { ReactNode } from "react";
import { View } from "react-native";
import { T } from "./Text";
import { radius, space, useTheme } from "./theme";

export type BannerTone = "info" | "success" | "warning" | "danger";

/** Avviso in linea (sfondo tenue del colore semantico). */
export function Banner({
  tone = "info",
  title,
  children,
}: {
  tone?: BannerTone;
  title?: string;
  children?: ReactNode;
}) {
  const t = useTheme();
  const c = {
    info: { bg: t.accentSoft, fg: t.accentText, line: t.accentLine },
    success: { bg: t.successSoft, fg: t.success, line: t.successSoft },
    warning: { bg: t.warningSoft, fg: t.warning, line: t.warningSoft },
    danger: { bg: t.dangerSoft, fg: t.danger, line: t.dangerSoft },
  }[tone];
  return (
    <View
      accessibilityRole={tone === "danger" ? "alert" : "summary"}
      style={{
        backgroundColor: c.bg,
        borderColor: c.line,
        borderWidth: 1,
        borderRadius: radius.button,
        padding: space.md,
        gap: 2,
      }}
    >
      {title ? (
        <T variant="bodyStrong" style={{ color: c.fg }}>
          {title}
        </T>
      ) : null}
      {typeof children === "string" ? (
        <T variant="small" tone="ink">
          {children}
        </T>
      ) : (
        children
      )}
    </View>
  );
}
