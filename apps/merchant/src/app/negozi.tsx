import { cardColors } from "@loyalty/shared/theme";
import { router } from "expo-router";
import { Pressable, View } from "react-native";
import { useSession } from "@/lib/session";
import { Button } from "@/ui/Button";
import { Icon } from "@/ui/Icon";
import { Monogram } from "@/ui/Monogram";
import { Screen } from "@/ui/Screen";
import { T } from "@/ui/Text";
import { radius, space, useTheme } from "@/ui/theme";

const ROLE = { owner: "Titolare", operator: "Operatore" } as const;

/** S2 · Scelta negozio (se più di uno). Dal profilo serve per cambiare negozio. */
export default function Negozi() {
  const { shops, shop: current, selectShop, signOut } = useSession();
  const t = useTheme();
  return (
    <Screen>
      <T variant="title" accessibilityRole="header" style={{ marginHorizontal: 4 }}>
        Dove lavori oggi?
      </T>
      <View style={{ gap: 14 }}>
        {shops.map((s) => {
          const c = cardColors(s.hexColor.toUpperCase());
          const active = current?.id === s.id;
          return (
            <Pressable
              key={s.id}
              accessibilityRole="button"
              accessibilityLabel={`${s.name}, ${ROLE[s.role]}${s.status === "suspended" ? ", sospeso" : ""}`}
              accessibilityState={{ selected: active }}
              testID={`negozio-${s.slug}`}
              onPress={() => {
                selectShop(s.id, current ? "cambio" : "scelta");
                // cambio dal profilo: si torna indietro (l'area riservata è già aperta sotto)
                if (current && router.canGoBack()) router.back();
                else router.replace("/");
              }}
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                gap: 14,
                padding: space.lg,
                minHeight: 76,
                borderRadius: radius.card,
                borderWidth: active ? 2 : 1,
                borderColor: active ? t.accentEdge : t.line,
                backgroundColor: pressed ? t.surface2 : t.surface,
              })}
            >
              <Monogram name={s.name} logoUrl={s.logoUrl} bg={c.bg} fg={c.fg} />
              <View style={{ flex: 1 }}>
                <T variant="subtitle" style={{ fontSize: 18 }}>
                  {s.name}
                </T>
                <T variant="small" tone="ink2">
                  {ROLE[s.role]}
                  {s.status === "suspended" ? " · sospeso" : ""}
                  {active ? " · attuale" : ""}
                </T>
              </View>
              <Icon name="chevron" color={t.ink2} size={20} strokeWidth={2.2} />
            </Pressable>
          );
        })}
      </View>
      <T variant="small" tone="ink2" style={{ paddingHorizontal: 4 }}>
        L&apos;ultima scelta viene ricordata. Si cambia dal profilo.
      </T>
      {current ? (
        <Button label="Annulla" variant="secondary" onPress={() => router.back()} />
      ) : (
        <Button label="Esci" variant="secondary" onPress={() => void signOut()} />
      )}
    </Screen>
  );
}
