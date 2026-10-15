import type { InactiveCustomer } from "@loyalty/shared/api";
import { router, type Href } from "expo-router";
import type { z } from "zod";
import { Pressable, View } from "react-native";
import { Card } from "@/ui/Card";
import { T } from "@/ui/Text";
import { fonts, space, useTheme } from "@/ui/theme";
import { longDate, plural } from "../format";

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join("");

/** Clienti inattivi da 60+ giorni (design T2), con il collegamento ai messaggi promozionali. */
export function InactiveList({
  total,
  withConsent,
  recent,
  stampsRequired,
}: {
  total: number;
  withConsent: number;
  recent: Array<z.output<typeof InactiveCustomer>>;
  stampsRequired: number;
}) {
  const t = useTheme();
  return (
    <Card style={{ gap: space.sm, padding: space.lg + 2, flex: 1 }}>
      <T variant="bodyStrong" style={{ fontSize: 17 }}>
        Clienti inattivi
      </T>
      <T variant="small" tone="ink2">
        Nessuna visita da oltre 60 giorni · {plural(total, "cliente", "clienti")}
      </T>
      {recent.length === 0 ? (
        <T tone="ink2" style={{ paddingVertical: space.md }}>
          Nessun cliente inattivo: tutti sono passati negli ultimi due mesi.
        </T>
      ) : (
        recent.map((c) => (
          <Pressable
            key={c.customerId}
            accessibilityRole="link"
            onPress={() => router.push(`/clienti/${c.customerId}` as Href)}
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              paddingVertical: space.sm,
              borderBottomWidth: 1,
              borderBottomColor: t.line,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <View
              style={{
                width: 34,
                height: 34,
                borderRadius: 17,
                backgroundColor: t.surface2,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <T style={{ fontSize: 13, fontFamily: fonts.bold }}>{initials(c.name)}</T>
            </View>
            <View style={{ flex: 1 }}>
              <T variant="bodyStrong" style={{ fontSize: 15 }} numberOfLines={1}>
                {c.name}
              </T>
              <T variant="small" tone="ink2" style={{ fontSize: 13 }}>
                Ultima visita {longDate(c.lastActivityAt)}
              </T>
            </View>
            <T variant="small" tone="ink2" style={{ fontVariant: ["tabular-nums"] }}>
              {c.stamps}/{stampsRequired}
            </T>
          </Pressable>
        ))
      )}
      {withConsent > 0 ? (
        // le promozioni partono verso tutti i clienti con consenso, non solo verso gli inattivi
        <Pressable
          accessibilityRole="link"
          onPress={() => router.push("/messaggi")}
          style={{ marginTop: "auto", paddingTop: space.sm, gap: 2 }}
        >
          <T variant="small" tone="ink2">
            {withConsent === 1 ? "1 di loro riceve" : `${withConsent} di loro ricevono`} le promozioni.
          </T>
          <T variant="bodyStrong" style={{ color: t.accentText, fontSize: 14 }} testID="scrivi-inattivi">
            Scrivi un messaggio promozionale →
          </T>
        </Pressable>
      ) : null}
    </Card>
  );
}
