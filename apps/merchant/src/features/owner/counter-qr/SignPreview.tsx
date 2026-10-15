import { cardColors } from "@loyalty/shared/theme";
import { View } from "react-native";
import { Icon } from "@/ui/Icon";
import { Monogram } from "@/ui/Monogram";
import { T } from "@/ui/Text";
import { fonts, radius, space } from "@/ui/theme";

/**
 * Miniatura del cartello A5 (docs/design/Cartello A5): stessi colori, testi e timbri del PDF.
 * Il QR vero è nel PDF; qui un riquadro che indica dove porta.
 */
export function SignPreview({
  name,
  program,
  tagline,
  hexColor,
  logoUrl,
  stampsRequired,
  url,
}: {
  name: string;
  program: string;
  tagline: string;
  hexColor: string;
  logoUrl: string | null;
  stampsRequired: number;
  url: string;
}) {
  const c = cardColors(hexColor.toUpperCase());
  const filled = Math.round(stampsRequired * 0.6);
  const dot = stampsRequired > 12 ? 14 : 20;
  return (
    <View
      accessibilityLabel={`Anteprima del cartello: ${tagline}. Il QR porta a ${url}`}
      style={{
        width: "100%",
        maxWidth: 420,
        aspectRatio: 148 / 210,
        borderRadius: radius.card,
        overflow: "hidden",
        backgroundColor: c.bg,
      }}
      testID="anteprima-cartello"
    >
      <View style={{ padding: space.xl, gap: space.md }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
          <Monogram name={name} logoUrl={logoUrl} bg={c.fg} fg={c.bg} size={44} />
          <View>
            <T style={{ color: c.fg, fontFamily: fonts.bold, fontSize: 17 }}>{name}</T>
            <T style={{ color: c.label, fontSize: 12 }}>{program}</T>
          </View>
        </View>
        <T style={{ color: c.fg, fontFamily: fonts.bold, fontSize: 30, lineHeight: 32, letterSpacing: -0.6 }}>
          {tagline}
        </T>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {Array.from({ length: stampsRequired }, (_, i) => (
            <View
              key={i}
              style={{
                width: dot,
                height: dot,
                borderRadius: dot / 2,
                borderWidth: 2,
                borderColor: i < filled ? c.fg : c.ring,
                backgroundColor: i < filled ? c.fg : "transparent",
              }}
            />
          ))}
        </View>
      </View>
      <View
        style={{
          marginTop: "auto",
          backgroundColor: "#FBF8F3",
          borderTopLeftRadius: radius.card,
          borderTopRightRadius: radius.card,
          padding: space.lg,
          flexDirection: "row",
          gap: space.md,
          alignItems: "center",
        }}
      >
        <View style={{ alignItems: "center", gap: 4, width: "38%" }}>
          <View
            style={{
              width: "100%",
              aspectRatio: 1,
              borderRadius: radius.field,
              borderWidth: 1,
              borderColor: "#DDD4CA",
              backgroundColor: "#FFFFFF",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="scan" color="#2A211C" size={40} />
          </View>
          <T numberOfLines={1} style={{ fontSize: 9, color: "#5E534B" }}>
            {url.replace(/^https?:\/\//, "")}
          </T>
        </View>
        <View style={{ flex: 1, gap: 6 }}>
          <T style={{ color: "#2A211C", fontFamily: fonts.bold, fontSize: 15, lineHeight: 17 }}>
            Niente app da scaricare.
          </T>
          {["Inquadra il QR con la fotocamera", "Scrivi nome e telefono", "Salva la carta nel wallet"].map((s, i) => (
            <View key={s} style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
              <View
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: 8,
                  backgroundColor: c.bg,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <T style={{ color: c.fg, fontSize: 9, fontFamily: fonts.bold }}>{i + 1}</T>
              </View>
              <T style={{ color: "#2A211C", fontSize: 11, flex: 1 }}>{s}</T>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}
