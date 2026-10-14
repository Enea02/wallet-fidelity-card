import { STAMP_ICONS } from "@loyalty/shared/theme";
import { View } from "react-native";
import { SvgXml } from "react-native-svg";
import { useTheme } from "./theme";

/** Timbro pieno (disco con anello interno e forbici ruotate): il simbolo delle schermate di accesso. */
export function StampHero({ size = 64 }: { size?: number }) {
  const t = useTheme();
  const xml =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">` +
    `<circle cx="32" cy="32" r="30" fill="${t.accent}"/>` +
    `<circle cx="32" cy="32" r="24" fill="none" stroke="${t.onAccent}" stroke-opacity=".45" stroke-width="1.3"/>` +
    `<g transform="translate(16.4 16.4) scale(1.3) rotate(-12 12 12)" fill="none" stroke="${t.onAccent}" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">${STAMP_ICONS.scissors}</g>` +
    `</svg>`;
  return (
    <View aria-hidden style={{ width: size, height: size }}>
      <SvgXml xml={xml} width={size} height={size} />
    </View>
  );
}
