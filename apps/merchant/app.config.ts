import type { ConfigContext, ExpoConfig } from "expo/config";
import pkg from "./package.json";

/*
 * Configurazione dell'app esercente (iOS, Android, Web).
 * Gli identificativi si possono cambiare fino alla prima pubblicazione negli store (Fase 13).
 * Le variabili EXPO_PUBLIC_* sono pubbliche per definizione: mai segreti qui.
 */
const SENTRY_ORG = process.env.SENTRY_ORG;
const SENTRY_PROJECT = process.env.SENTRY_PROJECT;

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "Loyalty Wallet Esercente",
  slug: "loyalty-wallet-esercente",
  version: pkg.version,
  orientation: "default",
  icon: "./assets/icon.png",
  scheme: "loyaltywallet",
  userInterfaceStyle: "automatic",
  ios: {
    bundleIdentifier: "it.loyaltywallet.esercente",
    // team di firma per le build locali su un iPhone (APPLE_TEAM_ID); EAS usa le sue credenziali
    ...(process.env.APPLE_TEAM_ID && { appleTeamId: process.env.APPLE_TEAM_ID }),
    supportsTablet: true,
    buildNumber: process.env.APP_BUILD ?? "1",
    // NSAllowsLocalNetworking: in sviluppo l'app su iPhone parla in http con il Mac (backend e Supabase locali)
    infoPlist: { ITSAppUsesNonExemptEncryption: false, NSAppTransportSecurity: { NSAllowsLocalNetworking: true } },
  },
  android: {
    package: "it.loyaltywallet.esercente",
    versionCode: Number(process.env.APP_BUILD ?? "1"),
    adaptiveIcon: { foregroundImage: "./assets/adaptive-icon.png", backgroundColor: "#2A211C" },
    predictiveBackGestureEnabled: false,
  },
  web: {
    output: "single",
    favicon: "./assets/favicon.png",
    name: "Loyalty Wallet Esercente",
    shortName: "Esercente",
    lang: "it",
    backgroundColor: "#F7F2EB",
  },
  plugins: [
    // iOS 27: ciclo di vita a scene, altrimenti l'app si chiude all'avvio (vedi il plugin)
    "./plugins/with-scene-lifecycle.js",
    "expo-router",
    "expo-secure-store",
    "expo-localization",
    "expo-font",
    [
      "expo-camera",
      {
        cameraPermission: "La fotocamera serve per leggere il QR della carta fedeltà del cliente.",
        microphonePermission: false,
        recordAudioAndroid: false,
        barcodeScannerEnabled: true,
      },
    ],
    [
      "expo-splash-screen",
      {
        backgroundColor: "#F7F2EB",
        image: "./assets/splash-icon.png",
        imageWidth: 96,
        dark: { backgroundColor: "#1C1612" },
      },
    ],
    // carica source map e simboli nelle build di release solo se SENTRY_AUTH_TOKEN è presente (EAS/CI)
    ["@sentry/react-native/expo", { url: "https://sentry.io/", organization: SENTRY_ORG, project: SENTRY_PROJECT }],
  ],
  experiments: { typedRoutes: true },
  extra: {
    build: process.env.APP_BUILD ?? "dev",
    eas: process.env.EAS_PROJECT_ID ? { projectId: process.env.EAS_PROJECT_ID } : undefined,
  },
});
