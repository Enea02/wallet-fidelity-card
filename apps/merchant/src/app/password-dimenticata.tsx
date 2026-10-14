import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Platform, View } from "react-native";
import { authFailure } from "@/lib/auth/errors";
import { supabase } from "@/lib/auth/supabase";
import { config } from "@/lib/config";
import { log } from "@/lib/diagnostics/logger";
import { useOnline } from "@/lib/network";
import { Banner } from "@/ui/Banner";
import { Button } from "@/ui/Button";
import { Screen } from "@/ui/Screen";
import { T } from "@/ui/Text";
import { TextField } from "@/ui/TextField";
import { isEmail } from "@/lib/validation";

/** Il link porta alla web app (funziona su qualsiasi dispositivo); con il dominio aprirà anche l'app. */
const resetUrl = () =>
  `${Platform.OS === "web" && typeof window !== "undefined" ? window.location.origin : config.webUrl}/nuova-password`;

export default function PasswordDimenticata() {
  const params = useLocalSearchParams<{ email?: string }>();
  const online = useOnline();
  const [email, setEmail] = useState(params.email ?? "");
  const [error, setError] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!isEmail(email)) {
      setError("Scrivi un'email valida, ad esempio nome@negozio.it.");
      return;
    }
    setError(null);
    setBusy(true);
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: resetUrl() });
    setBusy(false);
    if (err) {
      setFailure(authFailure(err).userMessage);
      return;
    }
    log.event("app.password.reset_requested", { email: email.trim() });
    setSent(true);
  }

  return (
    <Screen fill>
      <View style={{ gap: 6 }}>
        <T variant="title" accessibilityRole="header">
          Password dimenticata
        </T>
        <T tone="ink2">Ti mandiamo un link per sceglierne una nuova.</T>
      </View>
      {sent ? (
        <Banner tone="success" title="Controlla la posta">
          {`Se ${email.trim()} è un account dello staff, tra poco ti arriva un'email con il link. Il link vale un'ora.`}
        </Banner>
      ) : (
        <>
          {failure ? <Banner tone="danger">{failure}</Banner> : null}
          <TextField
            label="Email"
            value={email}
            onChangeText={setEmail}
            error={error}
            placeholder="nome@negozio.it"
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            returnKeyType="send"
            onSubmitEditing={() => void submit()}
            testID="campo-email-recupero"
          />
        </>
      )}
      <View style={{ marginTop: "auto", gap: 10 }}>
        {sent ? null : (
          <Button label="Inviami il link" onPress={() => void submit()} loading={busy} disabled={!online} />
        )}
        <Button
          label="Torna all'accesso"
          variant="secondary"
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/accedi"))}
        />
      </View>
    </Screen>
  );
}
