import { CameraView, useCameraPermissions } from "expo-camera";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Linking, Pressable, StyleSheet, View } from "react-native";
import { log } from "@/lib/diagnostics/logger";
import { Button } from "@/ui/Button";
import { Icon } from "@/ui/Icon";
import { T } from "@/ui/Text";
import { space, useTheme } from "@/ui/theme";
import type { CameraScannerProps } from "./types";
import { Viewfinder } from "./Viewfinder";

/** Scanner a schermo pieno con la fotocamera posteriore (iOS e Android), lettura continua e torcia. */
export function CameraScanner({ active, onCode }: CameraScannerProps) {
  const t = useTheme();
  const [permission, request] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const loggedDenied = useRef(false);

  useEffect(() => {
    if (permission && !permission.granted && permission.status === "denied" && !loggedDenied.current) {
      loggedDenied.current = true;
      log.event("scan.camera.denied", { can_ask_again: permission.canAskAgain });
    }
  }, [permission]);

  if (!permission) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={t.accentText} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={[styles.center, { padding: space.xl, gap: space.lg }]}>
        <T variant="subtitle" center>
          Serve la fotocamera
        </T>
        <T tone="ink2" center>
          {permission.canAskAgain || permission.status === "undetermined"
            ? "Per leggere il QR della carta l'app usa la fotocamera, solo mentre sei su questa schermata."
            : "La fotocamera è stata negata. Riattivala dalle impostazioni, oppure usa il codice breve o il lettore esterno."}
        </T>
        {permission.canAskAgain || permission.status === "undetermined" ? (
          <Button label="Consenti la fotocamera" onPress={() => void request()} testID="consenti-fotocamera" />
        ) : (
          <Button label="Apri le impostazioni" onPress={() => void Linking.openSettings()} />
        )}
      </View>
    );
  }

  return (
    <View style={styles.fill}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        active={active}
        enableTorch={torch}
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        onBarcodeScanned={active ? (r) => onCode(r.data) : undefined}
      />
      <Viewfinder />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={torch ? "Spegni la torcia" : "Accendi la torcia"}
        onPress={() => setTorch((v) => !v)}
        style={[styles.torch, { backgroundColor: torch ? t.bg : "rgba(0,0,0,0.45)" }]}
      >
        <Icon name="torch" color={torch ? t.ink : "#FFFFFF"} size={24} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: "#000" },
  center: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center" },
  torch: {
    position: "absolute",
    right: space.lg,
    top: space.lg,
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
  },
});
