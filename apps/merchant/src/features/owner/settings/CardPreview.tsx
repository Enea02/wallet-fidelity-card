import { cardModule } from "@loyalty/shared/copy";
import { cardColors, strip, type StampIcon } from "@loyalty/shared/theme";
import { useState } from "react";
import { View } from "react-native";
import { SvgXml } from "react-native-svg";
import { Card } from "@/ui/Card";
import { Icon } from "@/ui/Icon";
import { Monogram } from "@/ui/Monogram";
import { Segmented } from "@/ui/Segmented";
import { T } from "@/ui/Text";
import { fonts, radius, space } from "@/ui/theme";

type Stage = "nuova" | "meta" | "premio";

export interface PreviewProps {
  name: string;
  programName: string;
  hexColor: string;
  logoUrl: string | null;
  stampsRequired: number;
  stampIcon: StampIcon;
  rewardLabel: string;
  stampUnit: string;
  stampUnitPlural: string;
}

/** Riquadro bianco che rappresenta il QR della carta (il QR vero è quello del cliente). */
function QrBox({ size }: { size: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        backgroundColor: "#FFFFFF",
        borderRadius: 8,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Icon name="scan" color="#1E1915" size={size * 0.5} />
    </View>
  );
}

function StripImage({
  p,
  filled,
  rewards,
  width,
}: {
  p: PreviewProps;
  filled: number;
  rewards: number;
  width: number;
}) {
  const c = cardColors(p.hexColor);
  const h = Math.round(width * 0.33);
  return (
    <SvgXml
      xml={strip({
        n: p.stampsRequired,
        filled,
        rewards,
        w: width,
        h,
        fg: c.fg,
        bg: c.bg,
        ring: c.ring,
        icon: p.stampIcon,
        numbers: true,
      })}
      width={width}
      height={h}
    />
  );
}

/**
 * Anteprima dal vivo della carta (design T1): Google Wallet e Apple Wallet negli stati
 * Nuova / A metà / Premio, con il modulo di testo. Colori corretti per il contrasto come
 * sulla carta vera (cardColors) e stesso testo del modulo (cardModule).
 */
export function CardPreview(p: PreviewProps) {
  const [stage, setStage] = useState<Stage>("meta");
  const [w, setW] = useState(0);
  const c = cardColors(p.hexColor);
  const n = p.stampsRequired;
  const filled = stage === "nuova" ? 0 : stage === "meta" ? Math.round(n * 0.6) : 0;
  const rewards = stage === "premio" ? 1 : 0;
  const stampsTxt = `${stage === "premio" ? 0 : filled} / ${n}`;
  const module = cardModule({
    stampsRequired: n,
    stamps: stage === "premio" ? 0 : filled,
    rewards,
    stampUnit: p.stampUnit,
    stampUnitPlural: p.stampUnitPlural,
    rewardLabel: p.rewardLabel,
  });
  const cardW = Math.max(0, w);

  return (
    <View
      style={{ gap: space.md }}
      onLayout={(e) => setW(Math.round(e.nativeEvent.layout.width))}
      testID="anteprima-carta"
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: space.md,
          flexWrap: "wrap",
        }}
      >
        <T variant="bodyStrong">Anteprima</T>
        <View style={{ minWidth: 240 }}>
          <Segmented
            value={stage}
            onChange={setStage}
            options={[
              { key: "nuova", label: "Nuova" },
              { key: "meta", label: "A metà" },
              { key: "premio", label: "Premio" },
            ]}
          />
        </View>
      </View>

      <T variant="label" tone="ink2">
        GOOGLE WALLET
      </T>
      <View style={{ backgroundColor: c.bg, borderRadius: 16, overflow: "hidden" }} testID="anteprima-google">
        <View style={{ padding: space.lg, gap: space.md }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
            <Monogram name={p.name} logoUrl={p.logoUrl} bg={c.fg} fg={c.bg} size={28} />
            <T style={{ color: c.fg, fontFamily: fonts.semibold, fontSize: 14 }} numberOfLines={1}>
              {p.name}
            </T>
          </View>
          <T style={{ color: c.fg, fontFamily: fonts.bold, fontSize: 20 }}>{p.programName}</T>
          <View style={{ flexDirection: "row", gap: space.xl }}>
            <View>
              <T style={{ color: c.label, fontSize: 11 }}>Timbri</T>
              <T style={{ color: c.fg, fontFamily: fonts.semibold }}>{stampsTxt}</T>
            </View>
            <View>
              <T style={{ color: c.label, fontSize: 11 }}>Premi</T>
              <T style={{ color: c.fg, fontFamily: fonts.semibold }}>{rewards > 0 ? `1 · ${p.rewardLabel}` : "0"}</T>
            </View>
          </View>
          <View style={{ alignItems: "center" }}>
            <QrBox size={110} />
          </View>
        </View>
        {cardW > 0 ? <StripImage p={p} filled={filled} rewards={rewards} width={cardW} /> : null}
      </View>

      <T variant="label" tone="ink2">
        APPLE WALLET
      </T>
      <View style={{ backgroundColor: c.bg, borderRadius: 10, overflow: "hidden" }} testID="anteprima-apple">
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, padding: space.md }}>
          <Monogram name={p.name} logoUrl={p.logoUrl} bg={c.fg} fg={c.bg} size={24} />
          <T style={{ color: c.fg, fontFamily: fonts.semibold, fontSize: 13, flex: 1 }} numberOfLines={1}>
            {p.name}
          </T>
          <View style={{ alignItems: "flex-end" }}>
            <T style={{ color: c.label, fontSize: 9, letterSpacing: 0.5 }}>TIMBRI</T>
            <T style={{ color: c.fg, fontFamily: fonts.semibold, fontSize: 14 }}>{stampsTxt}</T>
          </View>
        </View>
        {cardW > 0 ? <StripImage p={p} filled={filled} rewards={rewards} width={cardW} /> : null}
        <View style={{ flexDirection: "row", justifyContent: "space-between", padding: space.md }}>
          <View>
            <T style={{ color: c.label, fontSize: 9, letterSpacing: 0.5 }}>CLIENTE</T>
            <T style={{ color: c.fg, fontSize: 13 }}>Giulia R.</T>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <T style={{ color: c.label, fontSize: 9, letterSpacing: 0.5 }}>PREMI</T>
            <T style={{ color: c.fg, fontSize: 13 }}>{rewards}</T>
          </View>
        </View>
        <View style={{ alignItems: "center", paddingBottom: space.md }}>
          <QrBox size={96} />
        </View>
      </View>

      <Card style={{ gap: 2, borderRadius: radius.button }}>
        <T variant="small" tone="ink2">
          Modulo testo
        </T>
        <T variant="bodyStrong" testID="anteprima-modulo">
          {module.header}
        </T>
        <T variant="small" tone="ink2">
          {module.body}
        </T>
      </Card>
    </View>
  );
}
