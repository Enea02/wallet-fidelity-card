import type { ReactNode } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { space, useTheme } from "./theme";

/**
 * Contenitore di una schermata: sfondo del tema, margini di sicurezza, scorrimento e larghezza
 * massima leggibile su tablet e desktop. `fill` spinge l'ultimo blocco in basso (azioni a portata di pollice).
 */
export function Screen({
  children,
  maxWidth = 560,
  fill = false,
  padTop = true,
}: {
  children: ReactNode;
  maxWidth?: number;
  fill?: boolean;
  padTop?: boolean;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: t.bg }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          flexGrow: 1,
          paddingTop: (padTop ? insets.top : 0) + space.xl,
          paddingBottom: insets.bottom + space.xl,
          paddingHorizontal: space.lg + 4,
          alignItems: "center",
        }}
      >
        <View style={{ width: "100%", maxWidth, gap: space.lg + 2, flexGrow: fill ? 1 : 0 }}>{children}</View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
