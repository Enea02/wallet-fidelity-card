import { useEffect, useState } from "react";
import { View } from "react-native";
import { api, ApiError } from "@/lib/api";
import { useOnline } from "@/lib/network";
import { Banner } from "@/ui/Banner";
import { Button } from "@/ui/Button";
import { ErrorNotice } from "@/ui/ErrorNotice";
import { Sheet } from "@/ui/Sheet";
import { T } from "@/ui/Text";
import { TextField } from "@/ui/TextField";
import { space } from "@/ui/theme";

/**
 * Cancellazione del cliente con doppia conferma: avviso con le conseguenze, poi va scritto il
 * codice della carta. Il backend rimuove nome e telefono, pseudonimizza l'audit e disattiva
 * la carta nel wallet (delete_customer + notifyCardChanged).
 */
export function DeleteSheet({
  shopId,
  target,
  onClose,
  onDeleted,
}: {
  shopId: string;
  target: { id: string; name: string; shortCode: string } | null;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const online = useOnline();
  const [step, setStep] = useState<1 | 2>(1);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  useEffect(() => {
    setStep(1);
    setCode("");
    setError(null);
  }, [target]);

  if (!target)
    return (
      <Sheet visible={false} onClose={onClose}>
        {null}
      </Sheet>
    );
  const matches = code.trim().toUpperCase() === target.shortCode;

  async function remove() {
    if (!matches || !target) return;
    setBusy(true);
    try {
      await api.call("deleteCustomer", {
        shopId,
        params: { id: target.id },
        body: { reason: "richiesta dal titolare" },
      });
      onDeleted();
      onClose();
    } catch (e) {
      if (!(e instanceof ApiError)) throw e;
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet visible onClose={onClose} testID="foglio-cancellazione">
      {step === 1 ? (
        <>
          <T variant="subtitle">Cancellare la carta di {target.name}?</T>
          <Banner tone="danger" title="L'operazione non si può annullare">
            <T variant="small">
              Nome e telefono vengono eliminati, lo storico resta anonimo e la carta nel wallet del cliente viene
              disattivata. Se il cliente torna, si iscrive di nuovo da zero.
            </T>
          </Banner>
          <View style={{ flexDirection: "row", gap: space.md }}>
            <Button label="Annulla" variant="secondary" onPress={onClose} style={{ flex: 1 }} />
            <Button
              label="Continua"
              variant="danger"
              onPress={() => setStep(2)}
              style={{ flex: 1 }}
              testID="cancella-continua"
            />
          </View>
        </>
      ) : (
        <>
          <T variant="subtitle">Conferma la cancellazione</T>
          <T tone="ink2">
            Per confermare scrivi il codice della carta:{" "}
            <T style={{ fontWeight: "700", letterSpacing: 1 }}>{target.shortCode}</T>
          </T>
          <TextField
            label="Codice della carta"
            value={code}
            onChangeText={setCode}
            autoCapitalize="characters"
            autoCorrect={false}
            testID="cancella-codice"
          />
          {error ? <ErrorNotice error={error} /> : null}
          <View style={{ flexDirection: "row", gap: space.md }}>
            <Button label="Annulla" variant="secondary" onPress={onClose} style={{ flex: 1 }} />
            <Button
              label="Cancella definitivamente"
              variant="danger"
              onPress={() => void remove()}
              loading={busy}
              disabled={!matches || !online}
              style={{ flex: 1 }}
              testID="cancella-conferma"
            />
          </View>
        </>
      )}
    </Sheet>
  );
}
