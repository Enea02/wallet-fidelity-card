// Ciclo di vita a "scene" (UIScene) su iOS: iOS 27 chiude all'avvio le app che non lo adottano
// (UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption). Expo SDK 57 fornisce
// ExpoAppSceneDelegate ma il template generato non lo usa ancora: questo plugin
// - dichiara la scena in Info.plist con EXExpoAppSceneDelegate;
// - fa dell'AppDelegate un ExpoReactNativeFactoryProvider che crea la factory senza avviare
//   React Native (lo avvia la scena, nella sua finestra).
// Se il template cambia e il testo atteso non c'è, il prebuild si ferma con un errore chiaro.
const { withAppDelegate, withInfoPlist } = require("expo/config-plugins");

const START_IN_DELEGATE = `#if os(iOS) || os(tvOS)
    window = UIWindow(frame: UIScreen.main.bounds)
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions)
#endif
`;

function withSceneLifecycle(config) {
  config = withInfoPlist(config, (c) => {
    c.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          { UISceneConfigurationName: "Default Configuration", UISceneDelegateClassName: "EXExpoAppSceneDelegate" },
        ],
      },
    };
    return c;
  });

  return withAppDelegate(config, (c) => {
    if (c.modResults.language !== "swift") throw new Error("with-scene-lifecycle: AppDelegate Swift atteso");
    let src = c.modResults.contents;
    if (src.includes("ExpoReactNativeFactoryProvider")) return c; // già applicato
    const decl = "class AppDelegate: ExpoAppDelegate {";
    if (!src.includes(decl) || !src.includes(START_IN_DELEGATE)) {
      throw new Error(
        "with-scene-lifecycle: il template di AppDelegate.swift è cambiato; aggiornare il plugin (o rimuoverlo se Expo adotta le scene da sé)",
      );
    }
    src = src.replace(decl, "class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {");
    src = src.replace(
      START_IN_DELEGATE,
      "    // React Native parte nella finestra della scena (ExpoAppSceneDelegate)\n",
    );
    c.modResults.contents = src;
    return c;
  });
}

module.exports = withSceneLifecycle;
