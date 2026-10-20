import { router, useLocalSearchParams, type Href } from "expo-router";
import { useState } from "react";
import { useWindowDimensions, View } from "react-native";
import { CustomerDetail } from "@/features/owner/customers/CustomerDetail";
import { CustomerList } from "@/features/owner/customers/CustomerList";
import { useCustomers, type CustomerFilter } from "@/features/owner/customers/useCustomers";
import { LoadState } from "@/features/owner/Loading";
import { useApi } from "@/features/owner/useApi";
import { useShop } from "@/lib/session";
import { Card } from "@/ui/Card";
import { Chip } from "@/ui/Chip";
import { Screen } from "@/ui/Screen";
import { T } from "@/ui/Text";
import { TextField } from "@/ui/TextField";
import { space } from "@/ui/theme";

const FILTERS: Array<{ key: CustomerFilter; label: string }> = [
  { key: "tutti", label: "Tutti" },
  { key: "premio", label: "Con premio" },
  { key: "inattivi", label: "Inattivi" },
];

/**
 * Clienti (design T3). Desktop: tabella con il dettaglio affiancato (?id= nell'indirizzo).
 * Mobile: lista, il dettaglio si apre in /clienti/<id>.
 */
export default function Clienti() {
  const shop = useShop();
  const { width } = useWindowDimensions();
  const split = width >= 1100;
  const params = useLocalSearchParams<{ id?: string }>();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<CustomerFilter>("tutti");
  const list = useCustomers(shop.id, query, filter);
  const stats = useApi("stats", { shopId: shop.id });
  const selected = split ? (params.id ?? null) : null;

  return (
    <Screen maxWidth={split ? 1280 : 640}>
      <T variant="title" accessibilityRole="header">
        Clienti{" "}
        {stats.data ? (
          <T variant="title" tone="ink3">
            {stats.data.customersTotal}
          </T>
        ) : null}
      </T>
      <View style={{ flexDirection: split ? "row" : "column", gap: space.xl, alignItems: "flex-start" }}>
        <View style={{ flex: split ? 1.4 : undefined, width: "100%", gap: space.md }}>
          <TextField
            label="Cerca"
            value={query}
            onChangeText={setQuery}
            placeholder="Nome, telefono o codice della carta"
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            testID="cerca-clienti"
          />
          <View style={{ flexDirection: "row", gap: space.sm }} accessibilityRole="radiogroup">
            {FILTERS.map((f) => (
              <Chip
                key={f.key}
                label={f.label}
                selected={filter === f.key}
                onPress={() => setFilter(f.key)}
                testID={`filtro-${f.key}`}
              />
            ))}
          </View>
          {list.loading && list.items.length === 0 ? (
            <LoadState error={list.error} onRetry={() => void list.reload()} />
          ) : (
            <CustomerList
              items={list.items}
              stampsRequired={shop.stampsRequired}
              pointsMode={shop.loyaltyMode === "punti"}
              selectedId={selected}
              table={split}
              hasMore={list.hasMore}
              loadingMore={list.loadingMore}
              onLoadMore={() => void list.loadMore()}
              onSelect={(c) => (split ? router.setParams({ id: c.id }) : router.push(`/clienti/${c.id}` as Href))}
            />
          )}
        </View>
        {split ? (
          <View style={{ flex: 1, width: "100%" }}>
            {selected ? (
              <CustomerDetail
                key={selected}
                customerId={selected}
                onChanged={list.update}
                onDeleted={() => {
                  list.update({ id: selected, deleted: true });
                  router.setParams({ id: undefined });
                }}
              />
            ) : (
              <Card style={{ padding: space.xl }}>
                <T tone="ink2">Scegli un cliente per vedere saldo, storico e correzioni.</T>
              </Card>
            )}
          </View>
        ) : null}
      </View>
    </Screen>
  );
}
