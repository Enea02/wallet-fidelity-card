import { BricolageGrotesque_400Regular } from "@expo-google-fonts/bricolage-grotesque/400Regular";
import { BricolageGrotesque_600SemiBold } from "@expo-google-fonts/bricolage-grotesque/600SemiBold";
import { BricolageGrotesque_700Bold } from "@expo-google-fonts/bricolage-grotesque/700Bold";
import { useFonts } from "expo-font";
import { Stack, useNavigationContainerRef, type ErrorBoundaryProps } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { AppState, View } from "react-native";
import { SafeAreaInsetsContext, SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { app } from "@/lib/config";
import { deviceLabel } from "@/lib/diagnostics/device";
import { buffer, log } from "@/lib/diagnostics/logger";
import { initSentry, navigationIntegration, Sentry, sentryEnabled } from "@/lib/diagnostics/sentry";
import { startNetworkWatch, useOnline } from "@/lib/network";
import { SessionProvider, useSession } from "@/lib/session";
import { Button } from "@/ui/Button";
import { OfflineBanner } from "@/ui/OfflineBanner";
import { Screen } from "@/ui/Screen";
import { T } from "@/ui/Text";
import { ThemeProvider, useTheme } from "@/ui/theme";

initSentry();
startNetworkWatch();
void buffer
  .restore()
  .then(() =>
    log.event("app.start", { platform: app.platform, app_version: app.version, build: app.build, ...deviceLabel() }),
  );
// il buffer si salva subito quando l'app va in background (potrebbe non tornare in primo piano)
AppState.addEventListener("change", (s) => {
  if (s !== "active") void buffer.flush();
});
void SplashScreen.preventAutoHideAsync();

function Navigator() {
  const { status } = useSession();
  const t = useTheme();
  const online = useOnline();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <StatusBar style={online ? (t.mode === "dark" ? "light" : "dark") : t.mode === "dark" ? "dark" : "light"} />
      {online ? null : <OfflineBanner />}
      {/* con il banner in alto le schermate non devono aggiungere di nuovo il margine superiore */}
      <SafeAreaInsetsContext.Provider value={online ? insets : { ...insets, top: 0 }}>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.bg }, animation: "fade" }}>
          <Stack.Screen name="index" />
          <Stack.Protected guard={status === "signedOut"}>
            <Stack.Screen name="accedi" />
            <Stack.Screen name="password-dimenticata" />
          </Stack.Protected>
          <Stack.Protected guard={status === "chooseShop" || status === "ready"}>
            <Stack.Screen name="negozi" />
          </Stack.Protected>
          <Stack.Protected guard={status === "ready"}>
            <Stack.Screen name="(app)" />
          </Stack.Protected>
          <Stack.Screen name="invito" />
          <Stack.Screen name="nuova-password" />
        </Stack>
      </SafeAreaInsetsContext.Provider>
    </View>
  );
}

function Themed() {
  const { shop } = useSession();
  return (
    <ThemeProvider brand={shop?.hexColor}>
      <Navigator />
    </ThemeProvider>
  );
}

function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    BricolageGrotesque_400Regular,
    BricolageGrotesque_600SemiBold,
    BricolageGrotesque_700Bold,
  });
  const ref = useNavigationContainerRef();
  useEffect(() => {
    if (ref) navigationIntegration.registerNavigationContainer(ref);
  }, [ref]);
  const ready = fontsLoaded || fontError !== null;
  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);
  if (!ready) return null;
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <Themed />
      </SessionProvider>
    </SafeAreaProvider>
  );
}

// con Sentry spento (sviluppo, test) niente wrapper: sul web aggiunge proprietà solo native
export default sentryEnabled ? Sentry.wrap(RootLayout) : RootLayout;

/** Errore imprevisto in una schermata: Sentry lo registra, l'utente può riprovare. */
export function ErrorBoundary({ retry }: ErrorBoundaryProps) {
  return (
    <ThemeProvider brand={null}>
      <Screen fill>
        <T variant="title">Qualcosa non ha funzionato</T>
        <T tone="ink2">
          L&apos;errore è stato registrato. Riprova; se succede ancora usa &quot;Invia diagnostica&quot; dal profilo.
        </T>
        <View style={{ marginTop: "auto" }}>
          <Button label="Riprova" onPress={() => void retry()} />
        </View>
      </Screen>
    </ThemeProvider>
  );
}
