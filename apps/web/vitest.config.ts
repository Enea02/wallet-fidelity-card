import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@/": fileURLToPath(new URL("./src/", import.meta.url)),
      // "server-only" lancia fuori da un React Server Component: nei test è un modulo vuoto
      "server-only": fileURLToPath(new URL("./test/server-only-stub.ts", import.meta.url)),
    },
  },
  test: {
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    exclude: ["test/**/*.smoke.test.ts", "node_modules/**"],
  },
});
