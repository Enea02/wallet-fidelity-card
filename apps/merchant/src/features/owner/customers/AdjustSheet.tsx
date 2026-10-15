import { useEffect, useState } from "react";
import { View } from "react-native";
import { api, ApiError } from "@/lib/api";
import { useOnline } from "@/lib/network";
import { Button } from "@/ui/Button";
import { Chip } from "@/ui/Chip";
import { ErrorNotice } from "@/ui/ErrorNotice";
import { Sheet } from "@/ui/Sheet";
import { Stepper } from "@/ui/Stepper";
import { T } from "@/ui/Text";
import { TextField } from "@/ui/TextField";
import { space } from "@/ui/theme";
import { ADJUST_REASONS, adjustReason, adjustSummary, REASON_MIN, type AdjustReason } from "./adjust";

export interface AdjustTarget {
  id: string;
  name: string;
  stamps: number;
  rewards: number;
  stampsRequired: number;
}

/**
 * "Correggi saldo di Giulia" (design T3): nuovi valori con − e +, motivo obbligatorio (visibile
 * nello storico e nell'audit). La rettifica la fa la funzione Postgres adjust_balance.
 */
export function AdjustSheet({
  shopId,
  target,
  onClose,
  onDone,
}: {
  shopId: string;
  target: AdjustTarget | null;
  onClose: () => void;
  onDone: (card: { stamps: number; rewardsAvailable: number }) => void;
}) {
  const online = useOnline();
  const [stamps, setStamps] = useState(0);
  const [rewards, setRewards] = useState(0);
  const [chip, setChip] = useState<AdjustReason | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [tried, setTried] = useState(false);

  useEffect(() => {
    if (!target) return;
    setStamps(target.stamps);
    setRewards(target.rewards);
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
  const reason = adjustReason(chip, text);
  const changed = stamps !== target.stamps || rewards !== target.rewards;
  const first = target.name.split(/\s+/)[0] ?? target.name;

  async function save() {
    setTried(true);
    if (!reason || !changed || !target) return;
    setBusy(true);
    try {
      const r = await api.call("adjust", { shopId, params: { id: target.id }, body: { stamps, rewards, reason } });
      onDone({ stamps: r.card.stamps, rewardsAvailable: r.card.rewardsAvailable });
      onClose();
    } catch (e) {
      if (!(e instanceof ApiError)) throw e;
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet visible onClose={onClose} testID="foglio-rettifica">
      <T variant="subtitle">Correggi saldo di {first}</T>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.md, flexWrap: "wrap" }}>
        <T tone="ink2">
          Timbri: da <T style={{ fontWeight: "700" }}>{target.stamps}</T> a
        </T>
        <Stepper
          value={stamps}
          min={0}
          max={target.stampsRequired - 1}
          onChange={setStamps}
          label="timbri"
          testID="rettifica-timbri"
        />
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.md, flexWrap: "wrap" }}>
        <T tone="ink2">
          Premi da riscattare: da <T style={{ fontWeight: "700" }}>{target.rewards}</T> a
        </T>
        <Stepper value={rewards} min={0} max={99} onChange={setRewards} label="premi" testID="rettifica-premi" />
      </View>
      <T variant="bodyStrong" tone={changed ? "accentText" : "ink2"} testID="rettifica-riepilogo">
        {adjustSummary(target.stamps, stamps, target.rewards, rewards)}
      </T>

      <T variant="small" style={{ fontWeight: "600" }}>
        Motivo{" "}
        <T variant="small" tone="ink2">
          (obbligatorio, visibile nello storico)
        </T>
      </T>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }} accessibilityRole="radiogroup">
        {ADJUST_REASONS.map((r) => (
          <Chip key={r} label={r} selected={chip === r} onPress={() => setChip(r)} testID={`motivo-${r}`} />
        ))}
      </View>
      <TextField
        label={chip === "Altro" || chip === null ? "Spiega il motivo" : "Dettagli (facoltativi)"}
        value={text}
        onChangeText={setText}
        placeholder="Taglio del 10/10, Sara non aveva il telefono"
        maxLength={150}
        error={tried && !reason ? `Scegli un motivo o scrivine uno (almeno ${REASON_MIN} caratteri).` : null}
        testID="rettifica-motivo"
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
          testID="salva-rettifica"
        />
      </View>
    </Sheet>
  );
}
