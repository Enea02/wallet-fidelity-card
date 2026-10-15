import { router } from "expo-router";
import { useWindowDimensions, View } from "react-native";
import { InactiveList } from "@/features/owner/dashboard/InactiveList";
import { KpiTile } from "@/features/owner/dashboard/KpiTile";
import { WeeksChart } from "@/features/owner/dashboard/WeeksChart";
import { greeting, plural, weekDelta, weekRange } from "@/features/owner/format";
import { LoadState } from "@/features/owner/Loading";
import { useApi } from "@/features/owner/useApi";
import { useShop } from "@/lib/session";
import { Button } from "@/ui/Button";
import { Screen } from "@/ui/Screen";
import { T } from "@/ui/Text";
import { space } from "@/ui/theme";

/** Panoramica del titolare (design T2): numeri della settimana, 8 settimane, clienti inattivi. */
export default function Panoramica() {
  const shop = useShop();
  const { width } = useWindowDimensions();
  const wide = width >= 1100;
  const stats = useApi("stats", { shopId: shop.id });
  const s = stats.data;
  const week = s?.thisWeek;
  const prev = s?.weeks.at(-2);

  return (
    <Screen maxWidth={1180}>
      <View style={{ flexDirection: wide ? "row" : "column", justifyContent: "space-between", gap: space.md }}>
        <View style={{ gap: 2 }}>
          <T variant="title" accessibilityRole="header">
            {greeting(new Date().getHours())}
            {shop.displayName ? `, ${shop.displayName}` : ""}
          </T>
          {week ? <T tone="ink2">Settimana {weekRange(week.weekStart)}</T> : null}
        </View>
        <Button
          label="Scarica cartello da bancone"
          variant="secondary"
          onPress={() => router.push("/cartello")}
          style={{ alignSelf: wide ? "center" : "stretch" }}
          testID="apri-cartello"
        />
      </View>

      {!s || !week ? (
        <LoadState error={stats.error} onRetry={() => void stats.reload()} />
      ) : (
        <>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.md }}>
            <KpiTile
              label="Clienti iscritti"
              value={s.customersTotal}
              note={`+${week.enrollments} questa settimana`}
              testID="kpi-iscritti"
            />
            <KpiTile
              label="Timbri"
              value={week.stamps}
              note={weekDelta(week.stamps, prev?.stamps ?? 0)}
              testID="kpi-timbri"
            />
            <KpiTile
              label="Premi sbloccati"
              value={week.unlocked}
              note={`${plural(week.redeems, "riscattato", "riscattati")} questa settimana`}
              testID="kpi-premi"
            />
            <KpiTile
              label="Inattivi"
              value={s.inactive60Days}
              note="nessuna visita da 60+ giorni"
              testID="kpi-inattivi"
            />
          </View>
          <View style={{ flexDirection: wide ? "row" : "column", gap: space.md }}>
            <View style={{ flex: wide ? 1.6 : undefined }}>
              <WeeksChart weeks={s.weeks} />
            </View>
            <View style={{ flex: wide ? 1 : undefined }}>
              <InactiveList
                total={s.inactive60Days}
                withConsent={s.inactiveMarketing}
                recent={s.inactiveRecent}
                stampsRequired={shop.stampsRequired}
              />
            </View>
          </View>
        </>
      )}
    </Screen>
  );
}
