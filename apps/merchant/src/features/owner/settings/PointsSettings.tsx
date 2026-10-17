import type { ShopSettings } from "@loyalty/shared/api";
import { pointsModule, pointsTagline } from "@loyalty/shared/copy";
import { useEffect, useMemo, useState } from "react";
import type { z } from "zod";
import { View } from "react-native";
import { api, ApiError } from "@/lib/api";
import { useOnline } from "@/lib/network";
import type { Shop } from "@/lib/session";
import { Banner } from "@/ui/Banner";
import { Button } from "@/ui/Button";
import { Card } from "@/ui/Card";
import { ErrorNotice } from "@/ui/ErrorNotice";
import { Segmented } from "@/ui/Segmented";
import { Stepper } from "@/ui/Stepper";
import { T } from "@/ui/Text";
import { TextField } from "@/ui/TextField";
import { space } from "@/ui/theme";
import {
  hasProblems,
  levelsOf,
  MAX_LEVELS,
  pointsChanges,
  pointsProblems,
  toPointsDraft,
  type PointsDraft,
} from "./points";

type Saved = z.output<typeof ShopSettings>;

/**
 * Carta a timbri o a punti (Fase 9.6): modalità, punti per euro, spesa minima e livelli.
 * Si salva a parte dal resto della carta (funzione update_points_settings, con il suo audit).
 */
export function PointsSettings({ shop, saved, onSaved }: { shop: Shop; saved: Saved; onSaved: (s: Saved) => void }) {
  const online = useOnline();
  const base = useMemo(() => toPointsDraft(saved), [saved]);
  const [d, setD] = useState<PointsDraft>(base);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => setD(base), [base]);

  const problems = pointsProblems(d);
  const changes = pointsChanges(base, d);
  const dirty = Object.keys(changes).length > 0;
  const set = (patch: Partial<PointsDraft>) => {
    setDone(null);
    setD({ ...d, ...patch });
  };
  const setLevel = (i: number, patch: Partial<PointsDraft["levels"][number]>) =>
    set({ levels: d.levels.map((l, j) => (j === i ? { ...l, ...patch } : l)) });

  async function save() {
    if (!dirty || hasProblems(problems)) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.call("updateSettings", { shopId: shop.id, body: changes });
      setDone(
        changes.loyaltyMode
          ? changes.loyaltyMode === "punti"
            ? "Carta a punti attiva: in cassa ora si inserisce l'importo dello scontrino."
            : "Carta a timbri attiva."
          : "Salvato: le carte nei wallet si aggiornano entro qualche minuto.",
      );
      onSaved(r.settings);
    } catch (e) {
      if (!(e instanceof ApiError)) throw e;
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  const levels = levelsOf(d);
  const example = levels.length > 0 ? pointsModule({ points: 0, total: 0, levels }) : null;

  return (
    <Card style={{ gap: space.md }} testID="carta-punti">
      <View style={{ gap: 2 }}>
        <T variant="bodyStrong">Timbri o punti</T>
        <T variant="small" tone="ink2">
          Con i punti il cliente ne riceve per ogni euro speso e sale di livello; i punti totali non si perdono.
        </T>
      </View>
      <Segmented
        value={d.mode}
        options={[
          { key: "timbri", label: "Timbri" },
          { key: "punti", label: "Punti" },
        ]}
        onChange={(mode) => set({ mode })}
        testID="modalita-carta"
      />
      {d.mode === "punti" ? (
        <>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xl, alignItems: "flex-start" }}>
            <View style={{ gap: space.sm }}>
              <T variant="bodyStrong">Punti per ogni euro</T>
              <Stepper
                value={d.pointsPerEuro}
                min={1}
                max={100}
                onChange={(pointsPerEuro) => set({ pointsPerEuro })}
                label="punti per euro"
                testID="punti-per-euro"
              />
            </View>
            <View style={{ flex: 1, minWidth: 160 }}>
              <TextField
                label="Spesa minima (€, facoltativa)"
                value={d.minEuro}
                onChangeText={(v) => set({ minEuro: v.replace(/[^0-9.,]/g, "") })}
                keyboardType="decimal-pad"
                placeholder="nessuna"
                maxLength={7}
                error={problems.minEuro ?? null}
                testID="spesa-minima"
              />
            </View>
          </View>
          <T variant="small" tone="ink2">
            Arrotondati per difetto: con {d.pointsPerEuro === 1 ? "1 punto" : `${d.pointsPerEuro} punti`} per euro,
            23,50 € danno {Math.floor(23.5 * d.pointsPerEuro)} punti.
          </T>

          <T variant="bodyStrong">Livelli</T>
          {d.levels.map((l, i) => (
            <View key={i} style={{ gap: space.xs }} testID={`livello-${i}`}>
              <View style={{ flexDirection: "row", gap: space.sm, alignItems: "flex-end" }}>
                <View style={{ flex: 1.2 }}>
                  <TextField
                    label={`Livello ${i + 1}`}
                    value={l.name}
                    onChangeText={(name) => setLevel(i, { name })}
                    maxLength={20}
                    placeholder={["Silver", "Gold", "Platinum", "Diamond", "Elite"][i] ?? ""}
                    testID={`livello-${i}-nome`}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <TextField
                    label="Da punti"
                    value={l.min}
                    onChangeText={(min) => setLevel(i, { min: min.replace(/[^0-9]/g, "") })}
                    keyboardType="number-pad"
                    editable={i > 0}
                    maxLength={8}
                    testID={`livello-${i}-soglia`}
                  />
                </View>
              </View>
              <TextField
                label="Vantaggio (facoltativo)"
                value={l.perk}
                onChangeText={(perk) => setLevel(i, { perk })}
                maxLength={80}
                placeholder="-5% sui trattamenti"
                testID={`livello-${i}-vantaggio`}
              />
              {problems.level[i] ? (
                <T variant="small" tone="danger">
                  {problems.level[i]}
                </T>
              ) : null}
              {i > 0 ? (
                <Button
                  label="Togli livello"
                  variant="ghost"
                  onPress={() => set({ levels: d.levels.filter((_, j) => j !== i) })}
                  style={{ alignSelf: "flex-start" }}
                />
              ) : null}
            </View>
          ))}
          {d.levels.length < MAX_LEVELS ? (
            <Button
              label="Aggiungi livello"
              variant="secondary"
              onPress={() => {
                const last = Number(d.levels[d.levels.length - 1]?.min ?? 0);
                set({ levels: [...d.levels, { name: "", min: String(last + 500), perk: "" }] });
              }}
              style={{ alignSelf: "flex-start" }}
              testID="aggiungi-livello"
            />
          ) : null}
          {example && !hasProblems(problems) ? (
            <Banner tone="info" title="Sulla carta">
              {`${pointsTagline({ pointsPerEuro: d.pointsPerEuro, levels })} ${example.header}. ${example.body}`}
            </Banner>
          ) : null}
        </>
      ) : null}
      {dirty && d.mode !== base.mode ? (
        <T variant="small" tone="ink2">
          {d.mode === "punti"
            ? "Passando ai punti i timbri restano salvati ma non si usano più; le carte nei wallet mostrano punti e livello."
            : "Tornando ai timbri i punti restano salvati ma non si usano più."}
        </T>
      ) : null}
      {done ? <Banner tone="success">{done}</Banner> : null}
      {error ? <ErrorNotice error={error} /> : null}
      <Button
        label="Salva timbri o punti"
        onPress={() => void save()}
        loading={busy}
        disabled={!dirty || !online || hasProblems(problems)}
        testID="salva-punti"
      />
    </Card>
  );
}
