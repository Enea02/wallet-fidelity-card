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
  torch: '<path d="M8 3h8v3.5l-2 3V20a2 2 0 0 1-4 0V9.5l-2-3z"/><path d="M8 6.5h8M12 13v2.5"/>',
  camera: '<path d="M4 8h3l2-2.5h6L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  keyboard:
    '<rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6.5 10h.01M10 10h.01M13.5 10h.01M17 10h.01M7 14h10"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  sound: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>',
  mute: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="m16 9.5 5 5M21 9.5l-5 5"/>',
  print:
    '<path d="M7 9V3.5h10V9M7 17H4.5V10.5A1.5 1.5 0 0 1 6 9h12a1.5 1.5 0 0 1 1.5 1.5V17H17"/><path d="M7 14h10v6.5H7z"/>',
  share: '<path d="M12 15V3.5M7.5 8 12 3.5 16.5 8"/><path d="M5 12v7.5h14V12"/>',
  download: '<path d="M12 3.5V15M7.5 10.5 12 15l4.5-4.5"/><path d="M5 19.5h14"/>',
  search: '<circle cx="10.5" cy="10.5" r="6"/><path d="m15 15 5 5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  trash: '<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 12.5h9l1-12.5"/>',
  mail: '<rect x="3" y="5.5" width="18" height="13" rx="2"/><path d="m3.5 7 8.5 6 8.5-6"/>',
  bell: '<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
  palette:
    '<path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.4 0 2-1 1.4-2.2-.6-1.2.2-2.3 1.5-2.3H17a3.5 3.5 0 0 0 3.5-3.5C20.5 7.3 16.7 3.5 12 3.5z"/><circle cx="8" cy="11" r="1"/><circle cx="11.5" cy="7.5" r="1"/><circle cx="15.5" cy="9" r="1"/>',
  image:
    '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="10" r="1.8"/><path d="m4 18 5.5-5 4 3.5 2.5-2 4 3.5"/>',
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
