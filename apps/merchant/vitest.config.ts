import { defineConfig } from "vitest/config";

// Solo logica pura (client API, buffer, regole di navigazione): niente React Native nei test unitari.
export default defineConfig({
  test: { include: ["src/**/*.test.ts"], environment: "node" },
  resolve: { alias: { "@": new URL("./src", import.meta.url).pathname } },
});
