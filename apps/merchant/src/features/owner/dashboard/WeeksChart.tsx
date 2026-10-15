import type { WeekStats } from "@loyalty/shared/api";
import type { z } from "zod";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { Card } from "@/ui/Card";
import { T } from "@/ui/Text";
import { fonts, radius, space, useTheme } from "@/ui/theme";
import { plural, shortDate, weekRange } from "../format";

type Week = z.output<typeof WeekStats>;

/**
 * Ultime 8 settimane (design T2). Un solo asse: le barre sono i timbri; i premi sbloccati,
 * di scala molto diversa, sono un'etichetta numerica sulla barra (mai un secondo asse).
 * La settimana in corso è in evidenza. Tocco o passaggio del mouse: dettaglio della settimana.
 */
export function WeeksChart({ weeks, height = 190 }: { weeks: Week[]; height?: number }) {
  const t = useTheme();
  const [selected, setSelected] = useState<number | null>(null);
  const max = Math.max(1, ...weeks.map((w) => w.stamps));
  const focus = selected ?? weeks.length - 1;
  const fw = weeks[focus];

  return (
    <Card style={{ gap: space.md, padding: space.lg + 2 }}>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "baseline",
          flexWrap: "wrap",
          gap: space.sm,
        }}
      >
        <T variant="bodyStrong" style={{ fontSize: 17 }}>
          Ultime 8 settimane
        </T>
        <View style={{ flexDirection: "row", gap: space.md, alignItems: "center" }}>
          <Legend
            swatch={<View style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: t.accent }} />}
            label="Timbri"
          />
          <Legend
            swatch={
              <View
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: 7,
                  borderWidth: 2,
                  borderColor: t.accentText,
                  backgroundColor: t.surface,
                }}
              />
            }
            label="Premi sbloccati"
          />
        </View>
      </View>

      {/* dettaglio della settimana evidenziata (anche lettori di schermo) */}
      <T variant="small" tone="ink2" accessibilityLiveRegion="polite" testID="dettaglio-settimana">
        {fw
          ? `Settimana ${weekRange(fw.weekStart)}: ${plural(fw.stamps, "timbro", "timbri")}, ${plural(fw.unlocked, "premio sbloccato", "premi sbloccati")}, ${plural(fw.redeems, "riscattato", "riscattati")}`
          : ""}
      </T>

      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 6, height }} accessibilityRole="list">
        {weeks.map((w, i) => {
          const last = i === weeks.length - 1;
          const on = i === focus;
          const h = Math.max(4, Math.round((w.stamps / max) * (height - 30)));
          return (
            <Pressable
              key={w.weekStart}
              accessibilityRole="button"
              accessibilityLabel={`Settimana ${weekRange(w.weekStart)}: ${w.stamps} timbri, ${w.unlocked} premi sbloccati`}
              onPress={() => setSelected(i)}
              onHoverIn={() => setSelected(i)}
              onHoverOut={() => setSelected(null)}
              style={{ flex: 1, height: "100%", justifyContent: "flex-end", alignItems: "center" }}
            >
              <T
                variant="label"
                tone="ink2"
                style={{ marginBottom: 4, fontVariant: ["tabular-nums"], letterSpacing: 0 }}
              >
                {w.stamps}
              </T>
              <View
                style={{
                  width: "100%",
                  maxWidth: 56,
                  height: h,
                  backgroundColor: last || on ? t.accent : t.accentLine,
                  borderTopLeftRadius: radius.field - 2,
                  borderTopRightRadius: radius.field - 2,
                  borderBottomLeftRadius: 2,
                  borderBottomRightRadius: 2,
                  alignItems: "center",
                  paddingTop: 6,
                }}
              >
                {w.unlocked > 0 && h > 30 ? (
                  <View
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 12,
                      backgroundColor: t.surface,
                      borderWidth: 2,
                      borderColor: t.accentText,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <T style={{ fontSize: 11, lineHeight: 13, fontFamily: fonts.bold }}>{w.unlocked}</T>
                  </View>
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </View>
      <View style={{ flexDirection: "row", gap: 6, borderTopWidth: 1, borderTopColor: t.line, paddingTop: 6 }}>
        {weeks.map((w, i) => (
          <T
            key={w.weekStart}
            variant="label"
            center
            numberOfLines={1}
            style={{ flex: 1, letterSpacing: 0, color: i === focus ? t.ink : t.ink2 }}
          >
            {shortDate(w.weekStart)}
          </T>
        ))}
      </View>
    </Card>
  );
}

function Legend({ swatch, label }: { swatch: React.ReactNode; label: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      {swatch}
      <T variant="small" tone="ink2">
        {label}
      </T>
    </View>
  );
}
