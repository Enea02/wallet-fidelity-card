import { StyleSheet, View } from "react-native";
import { T } from "@/ui/Text";
import { radius, space } from "@/ui/theme";

/** Riquadro di mira al centro. */
export function Viewfinder() {
  return (
    <View pointerEvents="none" style={styles.center}>
      <View style={styles.frame} />
      <T style={{ color: "#FFFFFF", marginTop: space.lg, textShadowColor: "rgba(0,0,0,0.6)", textShadowRadius: 6 }}>
        Inquadra il QR della carta del cliente
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center" },
  frame: { width: 240, height: 240, borderRadius: radius.card, borderWidth: 3, borderColor: "rgba(255,255,255,0.9)" },
});
