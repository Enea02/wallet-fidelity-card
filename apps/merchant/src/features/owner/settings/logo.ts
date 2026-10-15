import { LOGO_MAX_BYTES } from "@loyalty/shared/api";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { Platform } from "react-native";
import { api } from "@/lib/api";
import { supabase } from "@/lib/auth/supabase";
import { log } from "@/lib/diagnostics/logger";
import { LOGO_SIZE, squareCrop } from "./logic";

/*
 * Logo del negozio: scelta dalla galleria (mobile) o da file (web), ritaglio quadrato
 * (su mobile quello di sistema, sul web automatico al centro), ridimensionamento a 660 px,
 * caricamento diretto su Supabase Storage con l'URL firmato del backend. Il server lo verifica
 * al salvataggio delle impostazioni (logo.upload.ok / logo.upload.failed).
 */

export interface PreparedLogo {
  uri: string;
  width: number;
}

/** Sceglie e prepara il logo; null se l'utente annulla. */
export async function pickLogo(): Promise<PreparedLogo | null> {
  const r = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsEditing: Platform.OS !== "web",
    aspect: [1, 1],
    quality: 1,
  });
  if (r.canceled || !r.assets[0]) return null;
  const a = r.assets[0];
  const ctx = ImageManipulator.manipulate(a.uri);
  if (a.width !== a.height) ctx.crop(squareCrop(a.width, a.height));
  ctx.resize({ width: LOGO_SIZE, height: LOGO_SIZE });
  const img = await (await ctx.renderAsync()).saveAsync({ format: SaveFormat.PNG });
  return { uri: img.uri, width: img.width };
}

/** Carica il logo preparato; restituisce il percorso da salvare nelle impostazioni (logoPath). */
export async function uploadLogo(shop: { id: string; name: string }, logo: PreparedLogo): Promise<string> {
  const bytes = await (await fetch(logo.uri)).arrayBuffer();
  if (bytes.byteLength > LOGO_MAX_BYTES) {
    log.event("logo.upload.failed", {
      shop_name: shop.name,
      stage: "caricamento",
      reason: `immagine di ${(bytes.byteLength / 1024 / 1024).toFixed(1).replace(".", ",")} MB dopo la preparazione`,
      http_status: null,
    });
    throw new Error("Il logo è troppo grande anche dopo il ridimensionamento: prova un'immagine più semplice.");
  }
  const { path, token } = await api.call("logoUploadUrl", {
    shopId: shop.id,
    body: { contentType: "image/png", sizeBytes: bytes.byteLength },
  });
  const { error } = await supabase.storage
    .from("logos")
    .uploadToSignedUrl(path, token, bytes, { contentType: "image/png" });
  if (error) {
    const status = (error as { statusCode?: string | number }).statusCode;
    log.event("logo.upload.failed", {
      shop_name: shop.name,
      stage: "caricamento",
      reason: error.message,
      http_status: status === undefined ? null : Number(status),
    });
    throw new Error("Il caricamento del logo non è riuscito: controlla la connessione e riprova.");
  }
  return path;
}
