// Configurazione ESLint condivisa da tutto il monorepo (flat config).
import js from "@eslint/js";
import nextPlugin from "@next/eslint-plugin-next";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/.next/**",
      "**/.turbo/**",
      "**/dist/**",
      "**/coverage/**",
      "docs/design/**",
      "apps/merchant/.expo/**",
      "apps/merchant/dist-e2e/**",
      "apps/merchant/build-iphone/**",
      "apps/merchant/playwright-report/**",
      "apps/merchant/test-results/**",
      "apps/merchant/ios/**",
      "apps/merchant/android/**",
      "apps/merchant/expo-env.d.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node } },
    rules: {
      // I log passano solo dal logger del catalogo (packages/shared/logging)
      "no-console": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/consistent-type-imports": "error",
    },
  },
  {
    files: ["apps/web/**/*.{ts,tsx}"],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { "@next/next": nextPlugin, "react-hooks": reactHooks },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
      // solo App Router: la regola serve per la cartella pages/
      "@next/next/no-html-link-for-pages": "off",
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
  {
    // app esercente (Expo: React Native + web)
    files: ["apps/merchant/**/*.{ts,tsx}"],
    languageOptions: { globals: { ...globals.browser, __DEV__: "readonly" } },
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
  {
    // configurazione Metro (CommonJS) e service worker della PWA
    files: ["apps/merchant/metro.config.js", "apps/merchant/jest.config.js", "apps/merchant/plugins/*.js"],
    languageOptions: { sourceType: "commonjs", globals: { ...globals.node } },
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  {
    // test dei componenti (jest-expo)
    files: ["apps/merchant/**/*.component.test.tsx"],
    languageOptions: { globals: { ...globals.jest } },
  },
  {
    files: ["apps/merchant/public/sw.js"],
    languageOptions: { globals: { ...globals.serviceworker } },
  },
  {
    // script di supporto eseguiti da riga di comando: l'output a terminale è voluto
    files: ["scripts/**/*.mjs", "**/scripts/**/*.{ts,mjs}"],
    rules: { "no-console": "off" },
  },
);
