// Test dei componenti React Native (scheda cliente nei vari stati) con jest-expo e Testing Library.
// La logica pura resta su Vitest (src/**/*.test.ts); qui solo src/**/*.component.test.tsx.
/** @type {import('jest').Config} */
module.exports = {
  preset: "jest-expo",
  testMatch: ["<rootDir>/src/**/*.component.test.tsx"],
  // pnpm: i pacchetti stanno in node_modules/.pnpm/<nome@versione>/node_modules/<nome>
  transformIgnorePatterns: [
    "node_modules/(?!(?:\\.pnpm/[^/]+/node_modules/)?(?:(?:jest-)?react-native|@react-native(?:-community)?|expo(?:nent)?|@expo(?:nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|react-native-svg|@supabase/.*))",
  ],
  moduleNameMapper: { "^@/(.*)$": "<rootDir>/src/$1" },
};
