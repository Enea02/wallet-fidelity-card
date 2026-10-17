import { pointsModule, pointsTagline, taglineFor } from "@loyalty/shared/copy";
import { cardColors, gridLayout, type StampIcon } from "@loyalty/shared/theme";
import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Pressable, useWindowDimensions, View } from "react-native";
import { CardPreview } from "@/features/owner/settings/CardPreview";
import { PointsSettings } from "@/features/owner/settings/PointsSettings";
import { pickLogo, uploadLogo, type PreparedLogo } from "@/features/owner/settings/logo";
import {
  COOLDOWNS,
  contrastChecks,
  cooldownLabel,
  draftChanges,
  draftErrors,
  ICONS,
  isHex,
  normHex,
  SWATCHES,
  type CardDraft,
} from "@/features/owner/settings/logic";
import { LoadState } from "@/features/owner/Loading";
import { useApi } from "@/features/owner/useApi";
import { api, ApiError } from "@/lib/api";
import { useOnline } from "@/lib/network";
import { useSession, useShop } from "@/lib/session";
import { Banner } from "@/ui/Banner";
import { Button } from "@/ui/Button";
import { Card } from "@/ui/Card";
import { Chip } from "@/ui/Chip";
import { ErrorNotice } from "@/ui/ErrorNotice";
import { Icon } from "@/ui/Icon";
import { Monogram } from "@/ui/Monogram";
import { Screen } from "@/ui/Screen";
import { Stepper } from "@/ui/Stepper";
import { T } from "@/ui/Text";
import { TextField } from "@/ui/TextField";
import { radius, space, useTheme } from "@/ui/theme";

type Settings = NonNullable<ReturnType<typeof useApi<"settings">>["data"]>["settings"];

const toDraft = (s: Settings): CardDraft => ({
  name: s.name,
  hexColor: s.hexColor.toUpperCase(),
  stampsRequired: s.stampsRequired,
  stampIcon: s.stampIcon,
  rewardLabel: s.rewardLabel,
  tagline: s.tagline ?? "",
  programName: s.programName,
  stampUnit: s.stampUnit,
  stampUnitPlural: s.stampUnitPlural,
  stampCooldownMinutes: s.stampCooldownMinutes,
});

/**
 * Impostazioni carta (design T1): logo, colore con verifiche di contrasto, timbri necessari,
 * icona, premio, testi e cooldown, con anteprima dal vivo delle carte Google e Apple.
 * Il salvataggio aggiorna il template Google subito e le carte entro qualche minuto.
 */
export default function Carta() {
  const shop = useShop();
  const { refreshShops } = useSession();
  const online = useOnline();
  const t = useTheme();
  const { width } = useWindowDimensions();
  const wide = width >= 1100;
  const settings = useApi("settings", { shopId: shop.id });
  const [saved, setSaved] = useState<Settings | null>(null);
  const [draft, setDraft] = useState<CardDraft | null>(null);
  const [hexText, setHexText] = useState("");
  const [logo, setLogo] = useState<PreparedLogo | null>(null);
  const [busy, setBusy] = useState(false);
  const [loyaltyBusy, setLoyaltyBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);

  useEffect(() => {
    const s = settings.data?.settings;
    if (!s || saved) return;
    setSaved(s);
    setDraft(toDraft(s));
    setHexText(s.hexColor.toUpperCase());
  }, [settings.data, saved]);

  const changes = useMemo(() => (saved && draft ? draftChanges(toDraft(saved), draft) : {}), [saved, draft]);
  const errors = draft ? draftErrors(draft) : {};
  const dirty = Object.keys(changes).length > 0 || logo !== null;

  if (!saved || !draft) {
    return (
      <Screen>
        <LoadState error={settings.error} onRetry={() => void settings.reload()} />
      </Screen>
    );
  }

  const set = <K extends keyof CardDraft>(k: K, v: CardDraft[K]) => {
    setDone(false);
    setDraft({ ...draft, [k]: v });
  };
  const color = isHex(draft.hexColor) ? normHex(draft.hexColor) : saved.hexColor.toUpperCase();
  const checks = contrastChecks(color);
  const grid = gridLayout(draft.stampsRequired);
  // carta a punti (Fase 9.6): niente griglia, icona, premio, unità e cooldown dei timbri
  const stamps = saved.loyaltyMode === "timbri";

  async function chooseLogo() {
    setLogoError(null);
    try {
      const l = await pickLogo();
      if (l) {
        setLogo(l);
        setDone(false);
      }
    } catch {
      setLogoError("Non riesco a leggere questa immagine: prova un PNG o un JPEG.");
    }
  }

  async function save() {
    if (!dirty || Object.keys(errors).length > 0 || !saved) return;
    setBusy(true);
    setError(null);
    setLogoError(null);
    try {
      const body: Record<string, unknown> = { ...changes };
      if (logo) body.logoPath = await uploadLogo(shop, logo);
      const r = await api.call("updateSettings", { shopId: shop.id, body });
      setSaved(r.settings);
      setDraft(toDraft(r.settings));
      setHexText(r.settings.hexColor.toUpperCase());
      setLogo(null);
      setDone(true);
      void refreshShops();
    } catch (e) {
      if (e instanceof ApiError) setError(e);
      else if (e instanceof Error) setLogoError(e.message);
      else throw e;
    } finally {
      setBusy(false);
    }
  }

  const reset = () => {
    setDraft(toDraft(saved));
    setHexText(saved.hexColor.toUpperCase());
    setLogo(null);
    setDone(false);
  };

  async function toggleLoyalty() {
    if (!saved) return;
    setLoyaltyBusy(true);
    setError(null);
    try {
      const r = await api.call("updateSettings", { shopId: shop.id, body: { loyaltyEnabled: !saved.loyaltyEnabled } });
      setSaved(r.settings);
      void refreshShops();
    } catch (e) {
      if (!(e instanceof ApiError)) throw e;
      setError(e);
    } finally {
      setLoyaltyBusy(false);
    }
  }

  const form = (
    <View style={{ gap: space.xl }}>
      <View style={{ gap: 4 }}>
        <T variant="title" accessibilityRole="header">
          Impostazioni carta
        </T>
        <T tone="ink2">Le modifiche arrivano su tutte le carte nei wallet entro qualche minuto.</T>
      </View>

      <Card style={{ gap: space.sm }} testID="programmi">
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
          <View style={{ flex: 1, gap: 2 }}>
            <T variant="bodyStrong">Carta fedeltà {saved.loyaltyEnabled ? "attiva" : "spenta"}</T>
            <T variant="small" tone="ink2">
              {saved.loyaltyEnabled
                ? saved.loyaltyMode === "punti"
                  ? "I clienti accumulano punti per ogni euro speso e salgono di livello."
                  : "I clienti accumulano timbri e ricevono il premio."
                : "Il negozio offre solo tessere prepagate: la pagina del QR propone le tessere."}
            </T>
          </View>
          <Button
            label={saved.loyaltyEnabled ? "Spegni" : "Attiva"}
            variant="secondary"
            loading={loyaltyBusy}
            disabled={!online || loyaltyBusy}
            onPress={() => void toggleLoyalty()}
            testID="carta-fedelta-interruttore"
          />
        </View>
        <Button
          label="Tessere prepagate →"
          variant="ghost"
          onPress={() => router.push("/tessere")}
          style={{ alignSelf: "flex-start" }}
          testID="apri-tessere"
        />
      </Card>

      {saved.loyaltyEnabled ? (
        <PointsSettings
          shop={shop}
          saved={saved}
          onSaved={(s) => {
            setSaved(s);
            void refreshShops();
          }}
        />
      ) : null}

      <View style={{ flexDirection: "row", gap: space.lg, alignItems: "center" }}>
        <Monogram
          name={draft.name}
          logoUrl={logo?.uri ?? saved.logoUrl}
          bg={checks.cardHex}
          fg={cardColors(color).fg}
          size={84}
        />
        <View style={{ flex: 1, gap: space.sm }}>
          <T variant="bodyStrong">Logo</T>
          <T variant="small" tone="ink2">
            Immagine quadrata, almeno 660 px. Senza logo usiamo le iniziali.
          </T>
          <Button
            label={logo ? "Cambia immagine" : "Carica logo"}
            variant="secondary"
            onPress={() => void chooseLogo()}
            testID="carica-logo"
          />
          {logo ? (
            <T variant="small" tone="accentText">
              Nuovo logo pronto: viene pubblicato quando salvi.
            </T>
          ) : null}
          {logoError ? (
            <T variant="small" tone="danger">
              {logoError}
            </T>
          ) : null}
        </View>
      </View>

      <View style={{ gap: space.sm }}>
        <T variant="bodyStrong">Colore</T>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }} accessibilityRole="radiogroup">
          {SWATCHES.map((hex) => (
            <Pressable
              key={hex}
              accessibilityRole="radio"
              accessibilityLabel={`Colore ${hex}`}
              accessibilityState={{ checked: color === hex }}
              testID={`colore-${hex}`}
              onPress={() => {
                setHexText(hex);
                set("hexColor", hex);
              }}
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: hex,
                borderWidth: 3,
                borderColor: color === hex ? t.ink : t.surface,
                outlineColor: t.line,
              }}
            />
          ))}
        </View>
        <TextField
          label="Codice HEX"
          value={hexText}
          onChangeText={(v) => {
            setHexText(v);
            set("hexColor", v);
          }}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={7}
          error={errors.hexColor ?? null}
          testID="colore-hex"
        />
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
          {checks.checks.map((c) => (
            <View
              key={c.label}
              style={{
                borderRadius: radius.pill,
                paddingHorizontal: 10,
                paddingVertical: 4,
                backgroundColor: c.ok ? t.successSoft : t.dangerSoft,
              }}
            >
              <T variant="label" style={{ letterSpacing: 0 }}>
                {c.label} {c.ratio.toFixed(1).replace(".", ",")}:1 {c.ok ? "✓" : "✕"}
              </T>
            </View>
          ))}
        </View>
        {checks.corrected ? (
          <Banner tone="info">{`Per la leggibilità la carta userà ${checks.cardHex} invece di ${color}.`}</Banner>
        ) : null}
      </View>

      {stamps ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xl }}>
          <View style={{ gap: space.sm }}>
            <T variant="bodyStrong">Timbri necessari</T>
            <Stepper
              value={draft.stampsRequired}
              min={5}
              max={20}
              onChange={(v) => set("stampsRequired", v)}
              label="timbri necessari"
              testID="timbri-necessari"
            />
            <T variant="small" tone="ink2">
              da 5 a 20 · griglia {grid.rows === 1 ? `1 × ${draft.stampsRequired}` : grid.perRow.join(" + ")}
            </T>
          </View>
          <View style={{ gap: space.sm }}>
            <T variant="bodyStrong">Icona del timbro</T>
            <View style={{ flexDirection: "row", gap: space.sm }} accessibilityRole="radiogroup">
              {ICONS.map((k) => (
                <Pressable
                  key={k}
                  accessibilityRole="radio"
                  accessibilityLabel={`Icona ${k}`}
                  accessibilityState={{ checked: draft.stampIcon === k }}
                  testID={`icona-${k}`}
                  onPress={() => set("stampIcon", k)}
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: radius.button - 2,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: t.surface,
                    borderWidth: draft.stampIcon === k ? 2 : 1,
                    borderColor: draft.stampIcon === k ? t.ink : t.line,
                  }}
                >
                  <Icon name={k as StampIcon} color={t.ink} size={22} />
                </Pressable>
              ))}
            </View>
          </View>
        </View>
      ) : null}

      {stamps ? (
        <TextField
          label="Testo del premio"
          value={draft.rewardLabel}
          onChangeText={(v) => set("rewardLabel", v)}
          maxLength={40}
          error={errors.rewardLabel ?? null}
          hint={`Appare sulla carta e nella notifica: “${draft.rewardLabel.trim() || "…"} disponibile!”`}
          testID="testo-premio"
        />
      ) : null}
      <TextField
        label="Frase d'apertura (facoltativa)"
        value={draft.tagline}
        onChangeText={(v) => set("tagline", v)}
        maxLength={80}
        placeholder={
          stamps
            ? taglineFor({ ...draft, tagline: null })
            : pointsTagline({ pointsPerEuro: saved.pointsPerEuro, levels: saved.pointsLevels })
        }
        error={errors.tagline ?? null}
        hint={`In alto nella pagina di iscrizione e sul cartello. Vuota: la scriviamo noi ${stamps ? "dal premio" : "dalla regola dei punti"}.`}
        testID="frase-apertura"
      />
      <Card style={{ gap: space.md }}>
        <T variant="bodyStrong">Testi della carta</T>
        <TextField
          label="Nome del negozio"
          value={draft.name}
          onChangeText={(v) => set("name", v)}
          maxLength={60}
          error={errors.name ?? null}
        />
        <TextField
          label="Nome del programma"
          value={draft.programName}
          onChangeText={(v) => set("programName", v)}
          maxLength={40}
          error={errors.programName ?? null}
          hint="Es. “Carta Amica”: è il titolo della carta nel wallet."
        />
        {stamps ? (
          <>
            <View style={{ flexDirection: "row", gap: space.md }}>
              <View style={{ flex: 1 }}>
                <TextField
                  label="Unità"
                  value={draft.stampUnit}
                  onChangeText={(v) => set("stampUnit", v)}
                  maxLength={20}
                  error={errors.stampUnit ?? null}
                />
              </View>
              <View style={{ flex: 1 }}>
                <TextField
                  label="Al plurale"
                  value={draft.stampUnitPlural}
                  onChangeText={(v) => set("stampUnitPlural", v)}
                  maxLength={20}
                  error={errors.stampUnitPlural ?? null}
                />
              </View>
            </View>
            <T variant="small" tone="ink2">
              Sulla carta: “Ti mancano 4 {draft.stampUnitPlural.trim() || "…"}”.
            </T>
          </>
        ) : null}
      </Card>

      {stamps ? (
        <View style={{ gap: space.sm }}>
          <T variant="bodyStrong">Tempo minimo tra due timbri</T>
          <T variant="small" tone="ink2">
            Evita due timbri alla stessa visita. Lo staff può comunque aggiungerlo (resta nel registro).
          </T>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }} accessibilityRole="radiogroup">
            {[...new Set([...COOLDOWNS, saved.stampCooldownMinutes])]
              .sort((a, b) => a - b)
              .map((m) => (
                <Chip
                  key={m}
                  label={cooldownLabel(m)}
                  selected={draft.stampCooldownMinutes === m}
                  onPress={() => set("stampCooldownMinutes", m)}
                  testID={`cooldown-${m}`}
                />
              ))}
          </View>
        </View>
      ) : null}

      {done ? (
        <Banner tone="success" title="Salvato">
          Le carte nei wallet si aggiornano entro qualche minuto.
        </Banner>
      ) : null}
      {error ? <ErrorNotice error={error} /> : null}
      {logoError && !busy ? (
        <Banner tone="danger" title="Logo non salvato">
          {logoError}
        </Banner>
      ) : null}
      <View style={{ flexDirection: "row", gap: space.md }}>
        <Button
          label="Salva e aggiorna le carte"
          onPress={() => void save()}
          loading={busy}
          disabled={!dirty || !online || Object.keys(errors).length > 0}
          style={{ flex: 2 }}
          testID="salva-carta"
        />
        <Button label="Ripristina" variant="secondary" onPress={reset} disabled={!dirty || busy} style={{ flex: 1 }} />
      </View>
    </View>
  );

  const example = pointsModule({ points: 0, total: 0, levels: saved.pointsLevels });
  const preview = !stamps ? (
    <Card style={{ gap: space.sm, backgroundColor: checks.cardHex }} testID="anteprima-punti">
      <T variant="bodyStrong" style={{ color: cardColors(color).fg }}>
        {draft.programName} · {draft.name}
      </T>
      <T variant="number" style={{ color: cardColors(color).fg }}>
        0 punti
      </T>
      <T variant="bodyStrong" style={{ color: cardColors(color).fg }}>
        {example.header}
      </T>
      <T variant="small" style={{ color: cardColors(color).fg }}>
        {example.body}
      </T>
    </Card>
  ) : (
    <CardPreview
      name={draft.name}
      programName={draft.programName}
      hexColor={color}
      logoUrl={logo?.uri ?? saved.logoUrl}
      stampsRequired={draft.stampsRequired}
      stampIcon={draft.stampIcon as StampIcon}
      rewardLabel={draft.rewardLabel}
      stampUnit={draft.stampUnit}
      stampUnitPlural={draft.stampUnitPlural}
    />
  );

  return (
    <Screen maxWidth={wide ? 1180 : 640}>
      {wide ? (
        <View style={{ flexDirection: "row", gap: space.xxl, alignItems: "flex-start" }}>
          <View style={{ flex: 1.15 }}>{form}</View>
          <View style={{ flex: 1 }}>{preview}</View>
        </View>
      ) : (
        <>
          {form}
          {preview}
        </>
      )}
    </Screen>
  );
}
