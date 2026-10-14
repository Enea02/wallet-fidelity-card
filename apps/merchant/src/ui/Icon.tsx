import { STAMP_ICONS } from "@loyalty/shared/theme";
import { View } from "react-native";
import { SvgXml } from "react-native-svg";

/* Icone a tratto 24×24 (stesso stile delle icone dei timbri). */
const PATHS = {
  home: '<path d="M4 10.5 12 4l8 6.5V20h-5.5v-5.5h-5V20H4z"/>',
  users:
    '<circle cx="9" cy="8.5" r="3.5"/><path d="M3 20c.6-3.4 3-5.5 6-5.5s5.4 2.1 6 5.5"/><path d="M15.5 5.2a3.5 3.5 0 0 1 0 6.6M17.5 14.8c1.9.7 3.1 2.5 3.5 5.2"/>',
  card: '<rect x="3" y="5" width="18" height="14" rx="3"/><circle cx="8.5" cy="12" r="2"/><circle cx="15.5" cy="12" r="2"/>',
  staff: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c.7-3.6 3.4-6 7-6s6.3 2.4 7 6"/>',
  message: '<path d="M4 5h16v11H9l-5 4z"/>',
  scan: '<path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16M4 12h16"/>',
  profile:
    '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="10" r="3"/><path d="M6.5 18.5c1.2-2 3.1-3 5.5-3s4.3 1 5.5 3"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  offline:
    '<path d="M3 3l18 18M8.5 8.6A9.6 9.6 0 0 0 4.8 11M12 7c2.7 0 5.1 1 7 2.8M7.6 13.5a6.2 6.2 0 0 1 4.4-1.8M12 18.5h.01"/>',
  ...STAMP_ICONS,
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({
  name,
  color,
  size = 22,
  strokeWidth = 2,
}: {
  name: IconName;
  color: string;
  size?: number;
  strokeWidth?: number;
}) {
  const xml = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">${PATHS[name]}</svg>`;
  return (
    <View aria-hidden style={{ width: size, height: size }}>
      <SvgXml xml={xml} width={size} height={size} />
    </View>
  );
}
