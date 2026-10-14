// Metro con Sentry: assegna un Debug ID a bundle e source map (stack leggibili in Sentry).
// Il monorepo pnpm lo configura Expo da sé (SDK 52+): niente watchFolders a mano.
const { getSentryExpoConfig } = require("@sentry/react-native/metro");

module.exports = getSentryExpoConfig(__dirname);
