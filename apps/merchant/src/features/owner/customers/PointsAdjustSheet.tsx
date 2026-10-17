import { useEffect, useState } from "react";
import { View } from "react-native";
import { api, ApiError } from "@/lib/api";
import { useOnline } from "@/lib/network";
import { Button } from "@/ui/Button";
import { Chip } from "@/ui/Chip";
import { ErrorNotice } from "@/ui/ErrorNotice";
import { Sheet } from "@/ui/Sheet";
import { T } from "@/ui/Text";
import { TextField } from "@/ui/TextField";
import { space } from "@/ui/theme";
import { adjustReason, REASON_MIN, type AdjustReason } from "./adjust";

export interface PointsAdjustTarget {
  id: string;
  name: string;
  points: number;
}

const REASONS = ["Scontrino dimenticato", "Errore dello staff", "Altro"] as const;

/**
 * "Correggi punti di Giulia" (Fase 9.6): nuovo saldo in punti e motivo obbligatorio (storico e
 * audit). La correzione la fa la funzione Postgres adjust_points, che aggiorna anche il livello.
 */
export function PointsAdjustSheet({
  shopId,
  target,
  onClose,
  onDone,
}: {
  shopId: string;
  target: PointsAdjustTarget | null;
  onClose: () => void;
  onDone: (points: number, level: string) => void;
}) {
  const online = useOnline();
  const [value, setValue] = useState("");
  const [chip, setChip] = useState<AdjustReason | (typeof REASONS)[number] | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [tried, setTried] = useState(false);

  useEffect(() => {
    if (!target) return;
    setValue(String(target.points));
    setChip(null);
    setText("");
    setError(null);
    setTried(false);
  }, [target]);

  if (!target)
    return (
      <Sheet visible={false} onClose={onClose}>
        {null}
      </Sheet>
    );
  const points = Number(value);
  const valid = value.trim() !== "" && Number.isInteger(points) && points >= 0 && points <= 10_000_000;
  const reason = adjustReason(chip as AdjustReason | null, text);
  const changed = valid && points !== target.points;
  const delta = points - target.points;
  const first = target.name.split(/\s+/)[0] ?? target.name;

  async function save() {
    setTried(true);
    if (!reason || !changed || !target) return;
    setBusy(true);
    try {
      const r = await api.call("pointsAdjust", { shopId, params: { id: target.id }, body: { points, reason } });
      onDone(r.card.points, r.card.level);
      onClose();
    } catch (e) {
      if (!(e instanceof ApiError)) throw e;
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet visible onClose={onClose} testID="foglio-rettifica-punti">
      <T variant="subtitle">Correggi punti di {first}</T>
      <TextField
        label={`Punti: da ${target.points} a`}
        value={value}
        onChangeText={(v) => setValue(v.replace(/[^0-9]/g, ""))}
        keyboardType="number-pad"
        maxLength={8}
        error={tried && !valid ? "Un numero da 0 a 10.000.000." : null}
        testID="rettifica-punti"
      />
      <T variant="bodyStrong" tone={changed ? "accentText" : "ink2"} testID="rettifica-punti-riepilogo">
        {changed
          ? `${delta > 0 ? "+" : "−"}${Math.abs(delta)} punti (cambia anche il totale e il livello)`
          : "nessuna modifica"}
      </T>
      <T variant="small" style={{ fontWeight: "600" }}>
        Motivo{" "}
        <T variant="small" tone="ink2">
          (obbligatorio, visibile nello storico)
        </T>
      </T>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }} accessibilityRole="radiogroup">
        {REASONS.map((r) => (
          <Chip key={r} label={r} selected={chip === r} onPress={() => setChip(r)} testID={`motivo-${r}`} />
        ))}
      </View>
      <TextField
        label={chip === "Altro" || chip === null ? "Spiega il motivo" : "Dettagli (facoltativi)"}
        value={text}
        onChangeText={setText}
        placeholder="Scontrino del 10/10 da 23,50 €"
        maxLength={150}
        error={tried && !reason ? `Scegli un motivo o scrivine uno (almeno ${REASON_MIN} caratteri).` : null}
        testID="rettifica-punti-motivo"
      />
      {error ? <ErrorNotice error={error} /> : null}
      <View style={{ flexDirection: "row", gap: space.md }}>
        <Button label="Annulla" variant="secondary" onPress={onClose} style={{ flex: 1 }} />
        <Button
          label="Salva correzione"
          onPress={() => void save()}
          loading={busy}
          disabled={!online || !changed}
          style={{ flex: 1 }}
          testID="salva-rettifica-punti"
        />
      </View>
    </Sheet>
  );
}
