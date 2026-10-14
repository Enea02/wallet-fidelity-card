import NetInfo from "@react-native-community/netinfo";
import * as Application from "expo-application";
import * as Device from "expo-device";
import { getCalendars, getLocales } from "expo-localization";
import { Platform } from "react-native";
import { app } from "../config";

/** Browser e sistema in parole semplici, es. { browser: "Chrome 141", os: "macOS" } (solo web). */
export function browserName(ua: string): { browser: string; os: string } {
  const os = /iPhone|iPad/.test(ua)
    ? "iOS"
    : /Android/.test(ua)
      ? "Android"
      : /Mac OS X/.test(ua)
        ? "macOS"
        : /Windows/.test(ua)
          ? "Windows"
          : /Linux/.test(ua)
            ? "Linux"
            : "sistema sconosciuto";
  const m =
    /Edg\/(\d+)/.exec(ua) ?? /Firefox\/(\d+)/.exec(ua) ?? /Chrome\/(\d+)/.exec(ua) ?? /Version\/(\d+).*Safari/.exec(ua);
  const name = ua.includes("Edg/")
    ? "Edge"
    : ua.includes("Firefox/")
      ? "Firefox"
      : ua.includes("Chrome/")
        ? "Chrome"
        : m
          ? "Safari"
          : "Browser";
  return { browser: `${name}${m ? ` ${m[1]}` : ""}`, os };
}

export function deviceLabel(): { device: string; os_version: string } {
  if (Platform.OS === "web") {
    const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
    const b = browserName(ua);
    return { device: b.browser, os_version: b.os };
  }
  return {
    device: Device.modelName ?? (Device.isDevice ? "dispositivo sconosciuto" : "simulatore"),
    os_version: Device.osVersion ?? "n/d",
  };
}

/** Informazioni del dispositivo per "Invia diagnostica" (niente identificativi personali). */
export async function deviceInfo(): Promise<Record<string, unknown>> {
  const net = await NetInfo.fetch().catch(() => null);
  const { device, os_version } = deviceLabel();
  return {
    platform: app.platform,
    app_version: app.version,
    build: app.build,
    native_version: Application.nativeApplicationVersion ?? null,
    native_build: Application.nativeBuildVersion ?? null,
    device,
    os: Platform.OS === "web" ? "web" : (Device.osName ?? Platform.OS),
    os_version,
    is_simulator: Platform.OS === "web" ? null : !Device.isDevice,
    language: getLocales()[0]?.languageTag ?? null,
    time_zone: getCalendars()[0]?.timeZone ?? null,
    connection: net ? { type: net.type, connected: net.isConnected, internet: net.isInternetReachable } : null,
    // la fotocamera arriva con lo scanner (Fase 7)
    permissions: { camera: "non ancora richiesta" },
    scanner: "non ancora disponibile",
    screen:
      Platform.OS === "web" && typeof window !== "undefined" ? `${window.innerWidth}x${window.innerHeight}` : null,
  };
}
