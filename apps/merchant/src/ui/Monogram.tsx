import { Image, View } from "react-native";
import { T } from "./Text";
import { fonts } from "./theme";

const initials = (name: string) =>
  name
    .replace(/^(bar|salone|pizzeria|studio|da)\s+/i, "")
    .split(/\s+/)
    .map((w) => w[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();

/** Logo del negozio, o le iniziali nel suo colore (stessa regola di monogram() in packages/shared/theme.ts). */
export function Monogram({
  name,
  logoUrl,
  bg,
  fg,
  size = 48,
}: {
  name: string;
  logoUrl?: string | null;
  bg: string;
  fg: string;
  size?: number;
}) {
  if (logoUrl)
    return (
      <Image
        source={{ uri: logoUrl }}
        accessibilityIgnoresInvertColors
        style={{ width: size, height: size, borderRadius: size / 2 }}
      />
    );
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: bg,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <T style={{ color: fg, fontFamily: fonts.bold, fontSize: size * 0.38, lineHeight: size * 0.46 }}>
        {initials(name)}
      </T>
    </View>
  );
}
