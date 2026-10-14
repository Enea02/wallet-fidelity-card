import * as Clipboard from "expo-clipboard";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { T } from "./Text";
import { fonts, radius, space, useTheme } from "./theme";

/** Codice da comunicare all'assistenza (ERR-XXXXX o ticket DIAG-…), copiabile con un tocco. */
export function SupportCode({ code, label = "Codice assistenza" }: { code: string; label?: string }) {
  const t = useTheme();
  const [copied, setCopied] = useState(false);
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, flexWrap: "wrap" }}>
      <T variant="small" tone="ink2">
        {label}
      </T>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label} ${code}: tocca per copiare`}
        testID="codice-assistenza"
        onPress={() => {
          void Clipboard.setStringAsync(code).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          });
        }}
        style={({ pressed }) => ({
          flexDirection: "row",
          alignItems: "center",
          gap: space.sm,
          borderRadius: radius.field,
          borderWidth: 1,
          borderColor: t.line,
          backgroundColor: pressed ? t.surface2 : t.surface,
          paddingHorizontal: space.sm,
          paddingVertical: 4,
        })}
      >
        <T
          variant="bodyStrong"
          style={{ fontFamily: fonts.bold, letterSpacing: 0.5, fontVariant: ["tabular-nums"] }}
          selectable
        >
          {code}
        </T>
        <T variant="small" tone="accentText">
          {copied ? "Copiato" : "Copia"}
        </T>
      </Pressable>
    </View>
  );
}
