import { Redirect, Slot, usePathname } from "expo-router";
import { useWindowDimensions, View } from "react-native";
import { SafeAreaInsetsContext, useSafeAreaInsets } from "react-native-safe-area-context";
import { canSee, homeFor, isWide, sectionOf } from "@/lib/navigation/sections";
import { useSession } from "@/lib/session";
import { Sidebar } from "@/ui/shell/Sidebar";
import { TabBar } from "@/ui/shell/TabBar";
import { TopBar } from "@/ui/shell/TopBar";
import { hrefOf } from "@/ui/shell/nav";
import { useTheme } from "@/ui/theme";

/**
 * Area dello staff: il ruolo decide le sezioni (l'operatore vede solo scanner e profilo).
 * Mobile: intestazione + tab in basso. Da 900 px (tablet orizzontale, desktop): barra laterale.
 */
export default function AppLayout() {
  const { shop } = useSession();
  const pathname = usePathname();
  const { width } = useWindowDimensions();
  const t = useTheme();
  const insets = useSafeAreaInsets();
  if (!shop) return null;

  const active = sectionOf(pathname);
  if (active && !canSee(shop.role, active)) return <Redirect href={hrefOf(homeFor(shop.role))} />;

  // lo Slot resta sempre nello stesso punto dell'albero: passando da telefono a tablet
  // (rotazione, finestra ridimensionata) la sezione aperta non si perde
  const wide = isWide(width);
  return (
    <View style={{ flex: 1, flexDirection: wide ? "row" : "column", backgroundColor: t.bg }}>
      {wide ? <Sidebar shop={shop} active={active} /> : <TopBar shop={shop} showProfile={shop.role === "owner"} />}
      {/* su mobile intestazione e tab occupano già i margini di sicurezza */}
      <SafeAreaInsetsContext.Provider value={wide ? insets : { ...insets, top: 0, bottom: 0 }}>
        <View style={{ flex: 1 }}>
          <Slot />
        </View>
      </SafeAreaInsetsContext.Provider>
      {wide ? null : <TabBar role={shop.role} active={active} />}
    </View>
  );
}
