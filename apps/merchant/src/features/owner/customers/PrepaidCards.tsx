import type { PrepaidView } from "@loyalty/shared/api";
import { useState } from "react";
import { View } from "react-native";
import { prepaidSummary } from "@/features/prepaid/state";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/ui/Button";
import { Card } from "@/ui/Card";
import { ErrorNotice } from "@/ui/ErrorNotice";
import { Sheet } from "@/ui/Sheet";
import { T } from "@/ui/Text";
import { TextField } from "@/ui/TextField";
import { space } from "@/ui/theme";

/**
 * Tessere prepagate del cliente (Fase 9.5) nella scheda dell'area titolare: stato, saldo, scadenza
 * e correzione del saldo con motivo (attivazione, scalo e ricarica si fanno dallo scanner).
 */
export function PrepaidCards({
  shopId,
  cards,
  online,
  onChanged,
}: {
  shopId: string;
  cards: PrepaidView[];
  online: boolean;
  onChanged: () => void;
}) {
  const [target, setTarget] = useState<PrepaidView | null>(null);
  const [balance, setBalance] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  if (cards.length === 0) return null;

  const open = (p: PrepaidView) => {
    setTarget(p);
    setBalance(String(p.balance));
    setReason("");
    setError(null);
  };

  async function save() {
    if (!target) return;
    setBusy(true);
    setError(null);
    try {
      await api.call("prepaidAdjust", {
        shopId,
        params: { id: target.id },
        body: { balance: Number(balance), reason: reason.trim() },
      });
      setTarget(null);
      onChanged();
    } catch (e) {
      if (!(e instanceof ApiError)) throw e;
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  const valid = /^\d{1,6}$/.test(balance) && reason.trim().length >= 5;

  return (
    <View style={{ gap: space.sm }} testID="tessere-cliente">
      <T variant="bodyStrong" style={{ fontSize: 17 }}>
        Tessere prepagate
      </T>
      {cards.map((p) => {
        const s = prepaidSummary(p);
        return (
          <Card key={p.id} style={{ gap: 4 }} testID={`tessera-cliente-${p.shortCode}`}>
            <T variant="bodyStrong">
              {p.productName} · {s.badge}
            </T>
            <T tone="ink2">
              {s.balance ? `${s.balance} ${p.unitPlural}` : "Da pagare e attivare in cassa"}
              {s.expiry ? ` · ${s.expiry}` : ""}
            </T>
            <T variant="small" tone="ink3">
              Codice {p.shortCode}
            </T>
            {p.state !== "da_attivare" ? (
              <Button
                label="Correggi saldo"
                variant="ghost"
                disabled={!online}
                onPress={() => open(p)}
                style={{ alignSelf: "flex-start" }}
                testID={`correggi-tessera-${p.shortCode}`}
              />
            ) : null}
          </Card>
        );
      })}

      <Sheet visible={target !== null} onClose={() => setTarget(null)} testID="foglio-correzione-tessera">
        <T variant="subtitle">Correggi il saldo di {target?.productName}</T>
        <TextField
          label={`Saldo corretto (${target?.unitPlural ?? ""})`}
          value={balance}
          onChangeText={(v) => setBalance(v.replace(/[^0-9]/g, ""))}
          keyboardType="number-pad"
          maxLength={6}
          testID="tessera-nuovo-saldo"
        />
        <TextField
          label="Motivo"
          value={reason}
          onChangeText={setReason}
          placeholder="due pagine stampate male"
          maxLength={200}
          hint="Resta nello storico con il tuo nome."
          testID="tessera-motivo"
        />
        {error ? <ErrorNotice error={error} /> : null}
        <View style={{ flexDirection: "row", gap: space.md }}>
          <Button label="Annulla" variant="secondary" onPress={() => setTarget(null)} style={{ flex: 1 }} />
          <Button
            label="Salva"
            onPress={() => void save()}
            loading={busy}
            disabled={!online || !valid}
            style={{ flex: 1 }}
            testID="salva-correzione-tessera"
          />
        </View>
      </Sheet>
    </View>
  );
}
