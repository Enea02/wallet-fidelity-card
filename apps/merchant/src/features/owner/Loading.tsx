import { ActivityIndicator, View } from "react-native";
import type { ApiError } from "@/lib/api";
import { Button } from "@/ui/Button";
import { ErrorNotice } from "@/ui/ErrorNotice";
import { space, useTheme } from "@/ui/theme";

/** Stato di caricamento o di errore di una schermata del titolare (con "Riprova"). */
export function LoadState({ error, onRetry }: { error: ApiError | null; onRetry: () => void }) {
  const t = useTheme();
  if (error) {
    return (
      <View style={{ gap: space.md }}>
        <ErrorNotice error={error} title="Non riesco a caricare i dati" />
        <Button label="Riprova" variant="secondary" onPress={onRetry} />
      </View>
    );
  }
  return (
    <View style={{ paddingVertical: space.xxl, alignItems: "center" }}>
      <ActivityIndicator color={t.accentText} accessibilityLabel="Caricamento" />
    </View>
  );
}
