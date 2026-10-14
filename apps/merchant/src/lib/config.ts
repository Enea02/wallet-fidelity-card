import Constants from "expo-constants";
import { Platform } from "react-native";

/*
 * Configurazione pubblica dell'app (variabili EXPO_PUBLIC_*, incluse nel bundle: mai segreti).
 * In locale le scrive `pnpm db:start` in apps/merchant/.env.local.
 */

/** Sull'emulatore Android "localhost" è l'emulatore stesso: il Mac si raggiunge da 10.0.2.2. */
export function forDevice(url: string, os: string = Platform.OS): string {
  if (os !== "android") return url;
  return url.replace(/\/\/(localhost|127\.0\.0\.1)([:/]|$)/, "//10.0.2.2$2");
}

const required = (name: string, value: string | undefined): string => {
  if (!value) throw new Error(`Variabile ${name} mancante: esegui pnpm db:start o completa apps/merchant/.env.local`);
  return value;
};

export const config = {
  apiUrl: forDevice(required("EXPO_PUBLIC_API_URL", process.env.EXPO_PUBLIC_API_URL)).replace(/\/$/, ""),
  supabaseUrl: forDevice(required("EXPO_PUBLIC_SUPABASE_URL", process.env.EXPO_PUBLIC_SUPABASE_URL)),
  supabaseAnonKey: required("EXPO_PUBLIC_SUPABASE_ANON_KEY", process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY),
  /** URL della web app esercente: destinazione dei link di recupero password. */
  webUrl: (process.env.EXPO_PUBLIC_WEB_URL ?? "http://localhost:8081").replace(/\/$/, ""),
  sentryDsn: process.env.EXPO_PUBLIC_SENTRY_DSN ?? "",
  env: process.env.EXPO_PUBLIC_APP_ENV ?? (__DEV__ ? "development" : "production"),
};

export const app = {
  version: Constants.expoConfig?.version ?? "0.0.0",
  build: String((Constants.expoConfig?.extra as { build?: string } | undefined)?.build ?? "dev"),
  platform: Platform.OS === "ios" || Platform.OS === "android" ? Platform.OS : ("web" as const),
};
