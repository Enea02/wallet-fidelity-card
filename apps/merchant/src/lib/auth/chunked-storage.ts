/*
 * Archiviazione della sessione Supabase su mobile con expo-secure-store (Keychain / Keystore).
 * SecureStore accetta valori fino a ~2 KB e la sessione (due JWT) è più grande: il valore si
 * divide in blocchi `<chiave>.0`, `<chiave>.1`, … con il numero di blocchi in `<chiave>.n`.
 * Le chiavi di SecureStore ammettono solo lettere, numeri, ".", "-" e "_".
 */

export interface KeyValueStore {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
}

export const CHUNK_SIZE = 1800;

const safeKey = (key: string) => key.replace(/[^\w.-]/g, "_");

export function chunkedStorage(store: KeyValueStore, chunkSize = CHUNK_SIZE): KeyValueStore {
  async function removeItem(key: string) {
    const k = safeKey(key);
    const n = Number(await store.getItem(`${k}.n`)) || 0;
    await Promise.all([
      ...Array.from({ length: n }, (_, i) => store.removeItem(`${k}.${i}`)),
      store.removeItem(`${k}.n`),
    ]);
  }
  return {
    async getItem(key) {
      const k = safeKey(key);
      const n = Number(await store.getItem(`${k}.n`));
      if (!Number.isInteger(n) || n <= 0) return null;
      const parts = await Promise.all(Array.from({ length: n }, (_, i) => store.getItem(`${k}.${i}`)));
      // blocco mancante (scrittura interrotta): meglio nessuna sessione che una corrotta
      return parts.some((p) => p === null) ? null : parts.join("");
    },
    async setItem(key, value) {
      const k = safeKey(key);
      await removeItem(key);
      const n = Math.max(1, Math.ceil(value.length / chunkSize));
      for (let i = 0; i < n; i++) await store.setItem(`${k}.${i}`, value.slice(i * chunkSize, (i + 1) * chunkSize));
      await store.setItem(`${k}.n`, String(n));
    },
    removeItem,
  };
}
