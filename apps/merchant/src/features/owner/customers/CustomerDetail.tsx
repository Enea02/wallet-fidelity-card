import { useState } from "react";
import { View } from "react-native";
import { StampGrid } from "@/features/card/StampGrid";
import { api, ApiError } from "@/lib/api";
import { useOnline } from "@/lib/network";
import { useShop } from "@/lib/session";
import { Banner } from "@/ui/Banner";
import { Button } from "@/ui/Button";
import { Card } from "@/ui/Card";
import { ErrorNotice } from "@/ui/ErrorNotice";
import { Sheet } from "@/ui/Sheet";
import { T } from "@/ui/Text";
import { fonts, space, useTheme } from "@/ui/theme";
import { historyLine, longDate } from "../format";
import { LoadState } from "../Loading";
import { useApi } from "../useApi";
import { AdjustSheet, type AdjustTarget } from "./AdjustSheet";
import { PrepaidCards } from "./PrepaidCards";
import { DeleteSheet } from "./DeleteSheet";
import type { Customer } from "./useCustomers";

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join("");

/**
 * Dettaglio del cliente (design T3, colonna destra): saldo con la griglia della carta,
 * correzione del saldo, revoca del consenso, cancellazione, storico dall'audit.
 */
export function CustomerDetail({
  customerId,
  onChanged,
  onDeleted,
}: {
  customerId: string;
  onChanged: (c: Customer) => void;
  onDeleted: () => void;
}) {
  const t = useTheme();
  const shop = useShop();
  const online = useOnline();
  const detail = useApi("customer", { shopId: shop.id, params: { id: customerId } });
  const [adjust, setAdjust] = useState<AdjustTarget | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const d = detail.data;
  if (!d) return <LoadState error={detail.error} onRetry={() => void detail.reload()} />;
  const c = d.customer;

  async function revoke() {
    setBusy(true);
    try {
      await api.call("marketing", { shopId: shop.id, params: { id: c.id }, body: { consent: false } });
      setConfirmRevoke(false);
      await detail.reload();
      onChanged({ ...c, consentMarketing: false });
    } catch (e) {
      if (!(e instanceof ApiError)) throw e;
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ gap: space.lg }} testID="dettaglio-cliente">
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
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
          <T style={{ color: t.accentText, fontFamily: fonts.bold }}>{initials(c.name)}</T>
        </View>
        <View style={{ flex: 1 }}>
          <T variant="subtitle" numberOfLines={1} testID="dettaglio-nome">
            {c.name}
          </T>
          <T variant="small" tone="ink2">
            {[c.phoneMasked, `dal ${longDate(c.createdAt)}`, c.shortCode].filter(Boolean).join(" · ")}
          </T>
        </View>
      </View>

      <Card>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
          <T variant="label" tone="ink2">
            SALDO
          </T>
          <T testID="dettaglio-saldo">
            <T variant="number" style={{ fontSize: 36, lineHeight: 40 }}>
              {c.stamps}
            </T>
            <T variant="subtitle" tone="ink2">
              /{c.stampsRequired}
            </T>
          </T>
        </View>
        <StampGrid n={c.stampsRequired} filled={c.stamps} icon={shop.stampIcon} />
        {c.rewardsAvailable > 0 ? (
          <T variant="small" tone="accentText" style={{ fontFamily: fonts.semibold }}>
            {c.rewardsAvailable === 1 ? "1 premio da riscattare" : `${c.rewardsAvailable} premi da riscattare`}:{" "}
            {c.rewardLabel}
          </T>
        ) : null}
        <T variant="small" tone="ink2" testID="dettaglio-consenso">
          {c.consentMarketing ? "Riceve le promozioni (consenso dato all'iscrizione)." : "Non riceve promozioni."}
        </T>
      </Card>

      {error ? <ErrorNotice error={error} /> : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
        <Button
          label="Correggi saldo"
          variant="secondary"
          disabled={!online}
          onPress={() =>
            setAdjust({
              id: c.id,
              name: c.name,
              stamps: c.stamps,
              rewards: c.rewardsAvailable,
              stampsRequired: c.stampsRequired,
            })
          }
          style={{ flexGrow: 1 }}
          testID="correggi-saldo"
        />
        {c.consentMarketing ? (
          <Button
            label="Revoca consenso"
            variant="secondary"
            disabled={!online}
            onPress={() => setConfirmRevoke(true)}
            style={{ flexGrow: 1 }}
            testID="revoca-consenso"
          />
        ) : null}
        <Button
          label="Cancella cliente"
          variant="danger"
          disabled={!online}
          onPress={() => setDeleting(true)}
          style={{ flexGrow: 1 }}
          testID="cancella-cliente"
        />
      </View>

      <PrepaidCards shopId={shop.id} cards={d.prepaidCards} online={online} onChanged={() => void detail.reload()} />

      <View style={{ gap: space.xs }}>
        <T variant="bodyStrong" style={{ fontSize: 17 }}>
          Storico
        </T>
        {d.history.map((h, i) => {
          const line = historyLine(h, c.rewardLabel);
          return (
            <View
              key={`${h.at}-${i}`}
              style={{
                flexDirection: "row",
                gap: space.md,
                paddingVertical: space.sm,
                borderBottomWidth: 1,
                borderBottomColor: t.line,
              }}
            >
              <View style={{ flex: 1 }}>
                <T variant="bodyStrong" style={{ fontSize: 15 }}>
                  {line.what}
                </T>
                <T variant="small" tone="ink2" style={{ fontSize: 13 }}>
                  {line.meta}
                </T>
              </View>
              <T variant="bodyStrong" style={{ fontVariant: ["tabular-nums"], fontSize: 15 }}>
                {line.delta}
              </T>
            </View>
          );
        })}
      </View>

      <AdjustSheet
        shopId={shop.id}
        target={adjust}
        onClose={() => setAdjust(null)}
        onDone={(b) => {
          void detail.reload();
          onChanged({ ...c, stamps: b.stamps, rewardsAvailable: b.rewardsAvailable });
        }}
      />
      <Sheet visible={confirmRevoke} onClose={() => setConfirmRevoke(false)} testID="foglio-revoca">
        <T variant="subtitle">Revocare il consenso alle promozioni?</T>
        <Banner tone="info">
          {`${c.name} non riceverà più messaggi promozionali. Solo il cliente può riattivarlo, iscrivendosi di nuovo con lo stesso numero.`}
        </Banner>
        <View style={{ flexDirection: "row", gap: space.md }}>
          <Button label="Annulla" variant="secondary" onPress={() => setConfirmRevoke(false)} style={{ flex: 1 }} />
          <Button
            label="Revoca"
            onPress={() => void revoke()}
            loading={busy}
            style={{ flex: 1 }}
            testID="conferma-revoca"
          />
        </View>
      </Sheet>
      <DeleteSheet
        shopId={shop.id}
        target={deleting ? { id: c.id, name: c.name, shortCode: c.shortCode } : null}
        onClose={() => setDeleting(false)}
        onDeleted={onDeleted}
      />
    </View>
  );
}
