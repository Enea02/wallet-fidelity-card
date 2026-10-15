import { File, Paths } from "expo-file-system";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

/*
 * PDF del cartello su iOS e Android: salvato nella cache dell'app, poi condiviso (Mail, WhatsApp,
 * File, AirDrop…) o mandato alla stampa con l'anteprima di sistema.
 */

const toBase64 = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(new Error("lettura del PDF non riuscita"));
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.readAsDataURL(blob);
  });

async function save(blob: Blob, name: string): Promise<string> {
  const file = new File(Paths.cache, name);
  if (file.exists) file.delete();
  file.create();
  file.write(await toBase64(blob), { encoding: "base64" });
  return file.uri;
}

export const pdfActions = {
  canShare: true,
  async share(blob: Blob, name: string) {
    const uri = await save(blob, name);
    await Sharing.shareAsync(uri, {
      mimeType: "application/pdf",
      UTI: "com.adobe.pdf",
      dialogTitle: "Cartello del negozio",
    });
  },
  async print(blob: Blob, name: string) {
    await Print.printAsync({ uri: await save(blob, name) });
  },
};
