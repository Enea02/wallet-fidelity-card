import { useState } from "react";
import { View } from "react-native";
import { Button } from "@/ui/Button";
import { T } from "@/ui/Text";
import { TextField } from "@/ui/TextField";
import { space } from "@/ui/theme";
import { normalizeShortCode } from "./parse";

/** Codice breve stampato sotto il QR (8 caratteri), quando il QR non si legge. */
export function ManualEntry({ busy, onCode }: { busy: boolean; onCode: (raw: string) => void }) {
  const [code, setCode] = useState("");
  const submit = () => {
    if (code.trim()) onCode(code);
  };
  return (
    <View
      style={{
        flex: 1,
        justifyContent: "center",
        padding: space.xl,
        gap: space.lg,
        width: "100%",
        maxWidth: 480,
        alignSelf: "center",
      }}
    >
      <T variant="subtitle">Scrivi il codice della carta</T>
      <T tone="ink2">Sono gli 8 caratteri sotto il QR, ad esempio DEMA2345. Maiuscole e spazi non contano.</T>
      <TextField
        label="Codice breve"
        value={code}
        onChangeText={(v) => setCode(normalizeShortCode(v).slice(0, 8))}
        placeholder="DEMA2345"
        autoCapitalize="characters"
        autoCorrect={false}
        autoFocus
        returnKeyType="search"
        onSubmitEditing={submit}
        testID="campo-codice-breve"
        style={{ fontSize: 24, letterSpacing: 3, textAlign: "center" }}
      />
      <Button
        label="Cerca la carta"
        size="lg"
        onPress={submit}
        loading={busy}
        disabled={code.length < 8}
        testID="cerca-codice"
      />
    </View>
  );
}
