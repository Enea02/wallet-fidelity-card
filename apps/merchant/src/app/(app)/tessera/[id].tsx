import { Redirect, router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { prepaidSummary, unitsText } from "@/features/prepaid/state";
import { usePrepaidActions } from "@/features/prepaid/usePrepaidActions";
import { scannedPrepaidFor, type ScannedPrepaid } from "@/features/scan/session";
import { useSound } from "@/features/scan/useSound";
import { log } from "@/lib/diagnostics/logger";
import { useOnline } from "@/lib/network";
import { useShop } from "@/lib/session";
import { Button } from "@/ui/Button";
import { Card } from "@/ui/Card";
import { ErrorNotice } from "@/ui/ErrorNotice";
import { Screen } from "@/ui/Screen";
import { Sheet } from "@/ui/Sheet";
import { Stepper } from "@/ui/Stepper";
import { T } from "@/ui/Text";
import { Toast } from "@/ui/Toast";
import { space, useTheme } from "@/ui/theme";

/** Scheda della tessera prepagata (Fase 9.5) o dell'abbonamento (Fase 9.6) dopo una lettura. Senza lettura si torna allo scanner. */
export default function Tessera() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const scanned = scannedPrepaidFor(String(id));
  if (!scanned) return <Redirect href="/scanner" />;
  return <PrepaidScreen scanned={scanned} />;
}

function PrepaidScreen({ scanned }: { scanned: ScannedPrepaid }) {
  const shop = useShop();
  const online = useOnline();
  const t = useTheme();
  const [sound] = useSound();
  const a = usePrepaidActions(shop, scanned.prepaid, sound, online);
  const p = a.prepaid;
  const s = prepaidSummary(p);
  const [quantity, setQuantity] = useState(1);
  const [confirm, setConfirm] = useState<"activate" | "recharge" | null>(null);
  const shown = useRef(false);

  useEffect(() => {
    if (shown.current) return;
    shown.current = true;
    log.event("scan.card.shown", {
      customer_ref: scanned.prepaid.shortCode,
      mode: scanned.mode,
      duration_ms: Date.now() - scanned.scannedAt,
    });
  }, [scanned]);

  // la quantità non supera mai il saldo
  useEffect(() => {
    if (a.can.maxQuantity > 0 && quantity > a.can.maxQuantity) setQuantity(a.can.maxQuantity);
  }, [a.can.maxQuantity, quantity]);

  const next = () => (router.canGoBack() ? router.back() : router.replace("/scanner"));
  const first = p.name.trim().split(/\s+/)[0] ?? "";
  const membership = p.kind === "abbonamento";
  const stateTone = p.state === "attiva" ? t.success : p.state === "da_attivare" ? t.warning : t.danger;

  return (
    <View style={{ flex: 1 }}>
      <Screen fill maxWidth={560}>
        <View style={{ gap: space.xs }}>
          <T variant="label" tone="ink2">
            {p.productName.toUpperCase()} · {p.shortCode}
          </T>
          <T variant="title" testID="tessera-nome">
            {p.name}
          </T>
        </View>

        <Card style={{ gap: space.sm, alignItems: "center", paddingVertical: space.xl }} testID="tessera-scheda">
          <View style={{ paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999, backgroundColor: stateTone }}>
            <T variant="label" style={{ color: "#FFFFFF" }} testID="tessera-stato">
              {s.badge}
            </T>
          </View>
          {s.balance ? (
            <T variant={membership ? "subtitle" : "number"} center testID="tessera-saldo">
              {s.balance}
            </T>
          ) : null}
          <T variant="bodyStrong" center>
            {s.title}
          </T>
          {s.expiry ? (
            <T variant="small" tone="ink2">
              {s.expiry}
            </T>
          ) : null}
        </Card>

        {a.error ? <ErrorNotice error={a.error} /> : null}

        <View style={{ gap: space.md, marginTop: "auto" }}>
          {p.state === "da_attivare" ? (
            <>
              <T tone="ink2" center>
                {membership
                  ? "Il cliente paga l'abbonamento in cassa, poi attiva la tessera."
                  : `Il cliente paga ${unitsText(p, p.units ?? 0)} in cassa, poi attiva la tessera.`}
              </T>
              <Button
                label="Attiva (pagamento ricevuto)"
                size="lg"
                onPress={() => setConfirm("activate")}
                disabled={!a.can.activate}
                loading={a.busy === "activate"}
                testID="tessera-attiva"
              />
            </>
          ) : null}

          {p.state === "attiva" && !membership ? (
            <>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <T variant="bodyStrong">Quante {p.unitPlural}?</T>
                <Stepper
                  value={quantity}
                  min={1}
                  max={Math.max(1, a.can.maxQuantity)}
                  onChange={setQuantity}
                  label={p.unitPlural ?? ""}
                  testID="tessera-quantita"
                />
              </View>
              <Button
                label={`Scala ${unitsText(p, quantity)}`}
                size="lg"
                onPress={() => void a.consume(quantity)}
                disabled={!a.can.consume || quantity > a.can.maxQuantity}
                loading={a.busy === "consume"}
                testID="tessera-scala"
              />
            </>
          ) : null}

          {a.can.undo ? (
            <Button
              label={`Annulla ultimo scalo (${Math.floor(a.can.undoSecondsLeft / 60)}:${String(a.can.undoSecondsLeft % 60).padStart(2, "0")})`}
              variant="ghost"
              onPress={() => void a.undo()}
              loading={a.busy === "prepaid_undo"}
              testID="tessera-annulla"
            />
          ) : null}

          {p.state !== "da_attivare" && (!membership || a.can.recharge || !online) ? (
            <Button
              label={membership ? "Rinnova (pagamento ricevuto)" : `Ricarica ${s.rechargeLabel} (pagamento ricevuto)`}
              variant={p.state === "attiva" ? "secondary" : "primary"}
              onPress={() => setConfirm("recharge")}
              disabled={!a.can.recharge}
              loading={a.busy === "recharge"}
              testID="tessera-ricarica"
            />
          ) : null}

          <Button label="Cliente successivo" variant="ghost" onPress={next} testID="cliente-successivo" />
        </View>
      </Screen>
      {a.toast ? <Toast title={a.toast.title} body={a.toast.body} /> : null}

      <Sheet visible={confirm !== null} onClose={() => setConfirm(null)} testID="foglio-pagamento">
        <T variant="subtitle">
          {confirm === "activate"
            ? `Attivare ${membership ? "l'abbonamento" : "la tessera"} di ${first}?`
            : membership
              ? `Rinnovare l'abbonamento di ${first}?`
              : `Ricaricare la tessera di ${first}?`}
        </T>
        <T tone="ink2">
          {membership
            ? "Conferma solo dopo aver ricevuto il pagamento: se è ancora valido, il rinnovo allunga dalla scadenza; resta nel registro con il tuo nome."
            : `Conferma solo dopo aver ricevuto il pagamento: aggiunge ${unitsText(p, p.units ?? 0)} alla tessera e resta nel registro con il tuo nome.`}
        </T>
        <View style={{ flexDirection: "row", gap: space.md }}>
          <Button label="Annulla" variant="secondary" onPress={() => setConfirm(null)} style={{ flex: 1 }} />
          <Button
            label="Pagamento ricevuto"
            style={{ flex: 1 }}
            testID="conferma-pagamento"
            onPress={() => {
              const what = confirm;
              setConfirm(null);
              void (what === "activate" ? a.activate() : a.recharge());
            }}
          />
        </View>
      </Sheet>
    </View>
  );
}
