import { describe, expect, it } from "vitest";
import { chunkedStorage, type KeyValueStore } from "./chunked-storage";

function memory(limit = 2048): KeyValueStore & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: async (k) => map.get(k) ?? null,
    setItem: async (k, v) => {
      if (!/^[\w.-]+$/.test(k)) throw new Error(`chiave non valida: ${k}`);
      if (v.length > limit) throw new Error("valore troppo grande per SecureStore");
      map.set(k, v);
    },
    removeItem: async (k) => {
      map.delete(k);
    },
  };
}

describe("archiviazione a blocchi (SecureStore)", () => {
  it("salva e rilegge una sessione più grande di 2 KB", async () => {
    const m = memory();
    const s = chunkedStorage(m);
    const session = JSON.stringify({ access_token: "a".repeat(3000), refresh_token: "r".repeat(40) });
    await s.setItem("sb-127-auth-token", session);
    expect(await s.getItem("sb-127-auth-token")).toBe(session);
    expect(m.map.get("sb-127-auth-token.n")).toBe("2");
  });

  it("riscrivere un valore più corto elimina i blocchi in più", async () => {
    const m = memory();
    const s = chunkedStorage(m, 10);
    await s.setItem("k", "x".repeat(35));
    await s.setItem("k", "corto");
    expect(await s.getItem("k")).toBe("corto");
    expect([...m.map.keys()].sort()).toEqual(["k.0", "k.n"]);
  });

  it("rimuove tutti i blocchi", async () => {
    const m = memory();
    const s = chunkedStorage(m, 10);
    await s.setItem("k", "x".repeat(25));
    await s.removeItem("k");
    expect(m.map.size).toBe(0);
    expect(await s.getItem("k")).toBeNull();
  });

  it("chiavi con caratteri non ammessi da SecureStore vengono normalizzate", async () => {
    const s = chunkedStorage(memory());
    await s.setItem("sb:http://127.0.0.1/auth", "v");
    expect(await s.getItem("sb:http://127.0.0.1/auth")).toBe("v");
  });

  it("un blocco mancante dà nessuna sessione invece di una sessione corrotta", async () => {
    const m = memory();
    const s = chunkedStorage(m, 10);
    await s.setItem("k", "x".repeat(25));
    m.map.delete("k.1");
    expect(await s.getItem("k")).toBeNull();
  });
});
