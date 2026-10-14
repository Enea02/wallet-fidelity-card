import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";
import { AppState, Platform } from "react-native";
import { config } from "../config";
import { chunkedStorage, type KeyValueStore } from "./chunked-storage";

/*
 * Client Supabase usato SOLO per l'autenticazione (login, rinnovo token, password, invito).
 * I dati passano tutti dalle API esercente. Sessione: SecureStore su mobile, localStorage sul web.
 * Flusso "implicit": i link di invito e di recupero portano i token nel frammento (#…) e
 * funzionano anche se aperti su un dispositivo diverso da quello che li ha chiesti.
 */

const secureStore: KeyValueStore = {
  getItem: (k) => SecureStore.getItemAsync(k),
  setItem: (k, v) => SecureStore.setItemAsync(k, v, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK }),
  removeItem: (k) => SecureStore.deleteItemAsync(k),
};

const webStorage: KeyValueStore = {
  getItem: async (k) => (typeof localStorage === "undefined" ? null : localStorage.getItem(k)),
  setItem: async (k, v) => localStorage.setItem(k, v),
  removeItem: async (k) => localStorage.removeItem(k),
};

export const supabase = createClient(config.supabaseUrl, config.supabaseAnonKey, {
  auth: {
    storage: Platform.OS === "web" ? webStorage : chunkedStorage(secureStore),
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: "implicit",
  },
});

// su mobile il rinnovo automatico gira solo con l'app in primo piano (indicazione di Supabase)
if (Platform.OS !== "web") {
  AppState.addEventListener("change", (state) => {
    if (state === "active") void supabase.auth.startAutoRefresh();
    else void supabase.auth.stopAutoRefresh();
  });
}

/** Preferenze non segrete (ultimo negozio scelto, buffer della diagnostica). */
export const prefs: KeyValueStore = Platform.OS === "web" ? webStorage : AsyncStorage;

/** Token dal frammento o dalla query di un link Supabase (invito, recupero) o l'errore del link. */
export function authParamsFromUrl(url: string): {
  accessToken?: string;
  refreshToken?: string;
  type?: string;
  error?: string;
} {
  const params = new URLSearchParams();
  const [beforeHash, hash = ""] = url.split("#");
  const query = beforeHash?.split("?")[1] ?? "";
  for (const part of [query, hash]) new URLSearchParams(part).forEach((v, k) => params.set(k, v));
  const out: ReturnType<typeof authParamsFromUrl> = {};
  const at = params.get("access_token");
  const rt = params.get("refresh_token");
  const type = params.get("type");
  const err = params.get("error_code") ?? params.get("error");
  if (at) out.accessToken = at;
  if (rt) out.refreshToken = rt;
  if (type) out.type = type;
  if (err) out.error = err;
  return out;
}
