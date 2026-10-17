import { ActivityIndicator, Pressable, View } from "react-native";
import { Icon } from "@/ui/Icon";
import { T } from "@/ui/Text";
import { fonts, radius, space, useTheme } from "@/ui/theme";
import { shortDate } from "../format";
import type { Customer } from "./useCustomers";

/**
 * Elenco clienti (design T3). Su desktop è una tabella (cliente, telefono, timbri, ultima
 * visita) con la riga scelta evidenziata; su mobile righe compatte.
 */
export function CustomerList({
  items,
  stampsRequired,
  pointsMode = false,
  selectedId,
  table,
  loadingMore,
  hasMore,
  onSelect,
  onLoadMore,
}: {
  items: Customer[];
  stampsRequired: number;
  /** Carta a punti (Fase 9.6): saldo in punti invece dei timbri. */
  pointsMode?: boolean;
  selectedId: string | null;
  table: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  onSelect: (c: Customer) => void;
  onLoadMore: () => void;
}) {
  const t = useTheme();
  const cell = (flex: number) => ({ flex, minWidth: 0 });
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: t.line,
        borderRadius: radius.card - 4,
        backgroundColor: t.surface,
        overflow: "hidden",
      }}
    >
      {table ? (
        <View
          style={{
            flexDirection: "row",
            paddingHorizontal: space.lg,
            paddingVertical: space.sm,
            borderBottomWidth: 1,
            borderBottomColor: t.line,
          }}
        >
          {(["Cliente", "Telefono", pointsMode ? "Punti" : "Timbri", "Ultima visita"] as const).map((h, i) => (
            <T key={h} variant="label" tone="ink2" style={cell(i === 0 ? 1.6 : i === 1 ? 1.2 : 1)}>
              {h.toUpperCase()}
            </T>
          ))}
        </View>
      ) : null}
      {items.length === 0 ? (
        <T tone="ink2" style={{ padding: space.xl }} center>
          Nessun cliente trovato.
        </T>
      ) : (
        items.map((c) => {
          const on = c.id === selectedId;
          const balance = pointsMode ? `${c.points} pt` : `${c.stamps}/${stampsRequired}`;
          const last = c.lastVisitAt ? shortDate(c.lastVisitAt) : "mai tornato";
          return (
            <Pressable
              key={c.id}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={
                pointsMode
                  ? `${c.name}, ${c.points} punti${c.pointsLevel ? `, livello ${c.pointsLevel}` : ""}`
                  : `${c.name}, ${c.stamps} timbri su ${stampsRequired}${c.rewardsAvailable ? ", premio da riscattare" : ""}`
              }
              testID={`cliente-${c.shortCode}`}
              onPress={() => onSelect(c)}
              style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => ({
                flexDirection: "row",
                alignItems: "center",
                gap: space.sm,
                paddingHorizontal: space.lg,
                minHeight: table ? 50 : 64,
                borderBottomWidth: 1,
                borderBottomColor: t.line,
                backgroundColor: on ? t.accentSoft : pressed || hovered ? t.surface2 : "transparent",
              })}
            >
              {table ? (
                <>
                  <View style={[cell(1.6), { flexDirection: "row", alignItems: "center", gap: 6 }]}>
                    <T variant="bodyStrong" numberOfLines={1} style={{ fontSize: 15, flexShrink: 1 }}>
                      {c.name}
                    </T>
                    {c.rewardsAvailable > 0 ? <Icon name="gift" color={t.accentText} size={16} /> : null}
                  </View>
                  <T
                    variant="small"
                    tone="ink2"
                    style={[cell(1.2), { fontVariant: ["tabular-nums"] }]}
                    numberOfLines={1}
                  >
                    {c.phoneMasked ?? "—"}
                  </T>
                  <T variant="small" style={[cell(1), { fontVariant: ["tabular-nums"] }]}>
                    {balance}
                  </T>
                  <T variant="small" tone="ink2" style={cell(1)}>
                    {last}
                  </T>
                </>
              ) : (
                <>
                  <View style={{ flex: 1, paddingVertical: space.sm }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <T variant="bodyStrong" numberOfLines={1} style={{ flexShrink: 1 }}>
                        {c.name}
                      </T>
                      {c.rewardsAvailable > 0 ? <Icon name="gift" color={t.accentText} size={16} /> : null}
                    </View>
                    <T variant="small" tone="ink2" numberOfLines={1}>
                      {[c.phoneMasked, `ultima visita ${last}`].filter(Boolean).join(" · ")}
                    </T>
                  </View>
                  <T style={{ fontFamily: fonts.semibold, fontVariant: ["tabular-nums"] }}>{balance}</T>
                  <Icon name="chevron" color={t.ink3} size={18} />
                </>
              )}
            </Pressable>
          );
        })
      )}
      {hasMore ? (
        <Pressable
          accessibilityRole="button"
          onPress={onLoadMore}
          style={{ padding: space.lg, alignItems: "center" }}
          testID="carica-altri"
        >
          {loadingMore ? <ActivityIndicator color={t.accentText} /> : <T tone="accentText">Mostra altri clienti</T>}
        </Pressable>
      ) : null}
    </View>
  );
}
