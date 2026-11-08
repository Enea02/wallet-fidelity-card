import { Link } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Platform, View, type TextInput } from "react-native";
import type { AuthFailure } from "@/lib/auth/errors";
import { goToWebLogin } from "@/lib/auth/web-login";
import { isEmail } from "@/lib/validation";
import { useOnline } from "@/lib/network";
import { useSession } from "@/lib/session";
import { Banner } from "@/ui/Banner";
import { Button } from "@/ui/Button";
import { Screen } from "@/ui/Screen";
import { StampHero } from "@/ui/StampHero";
import { T } from "@/ui/Text";
import { TextField } from "@/ui/TextField";

/** S1 · Accesso staff. Web: login unico su /accesso (stesso server); app native: email e password qui. */
export default function Accedi() {
  return Platform.OS === "web" ? <WebAccedi /> : <NativeAccedi />;
}

/** Web: si entra dal login unico, che dopo riporta qui nella pagina da cui si era partiti. */
function WebAccedi() {
  useEffect(() => goToWebLogin(), []);
  return (
    <Screen fill>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 16 }}>
        <ActivityIndicator size="large" accessibilityLabel="Apertura della pagina di accesso" />
        <T tone="ink2" center>
          Apertura della pagina di accesso…
        </T>
        <Button label="Vai all'accesso" variant="secondary" onPress={() => goToWebLogin()} testID="vai-accesso" />
      </View>
    </Screen>
  );
}

/** Email e password (il link via email resta per invito e recupero). */
function NativeAccedi() {
  const { signIn, notice } = useSession();
  const online = useOnline();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [failure, setFailure] = useState<AuthFailure | null>(null);
  const [busy, setBusy] = useState(false);
  const passwordRef = useRef<TextInput>(null);

  async function submit() {
    const next: typeof errors = {};
    if (!isEmail(email)) next.email = "Scrivi un'email valida, ad esempio nome@negozio.it.";
    if (!password) next.password = "Scrivi la password.";
    setErrors(next);
    if (next.email || next.password) return;
    setBusy(true);
    setFailure(await signIn(email, password));
    setBusy(false);
  }

  return (
    <Screen fill>
      <StampHero />
      <View style={{ gap: 6 }}>
        <T variant="title" accessibilityRole="header">
          Accesso staff
        </T>
        <T tone="ink2">Usa l&apos;email con cui il titolare ti ha invitato.</T>
      </View>
      {notice ? <Banner tone="warning">{notice}</Banner> : null}
      {failure ? <Banner tone="danger">{failure.userMessage}</Banner> : null}
      <TextField
        label="Email"
        value={email}
        onChangeText={setEmail}
        error={errors.email ?? null}
        placeholder="nome@negozio.it"
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="username"
        returnKeyType="next"
        onSubmitEditing={() => passwordRef.current?.focus()}
        testID="campo-email"
      />
      <TextField
        ref={passwordRef}
        label="Password"
        value={password}
        onChangeText={setPassword}
        error={errors.password ?? null}
        secureTextEntry
        autoComplete="current-password"
        textContentType="password"
        returnKeyType="go"
        onSubmitEditing={() => void submit()}
        testID="campo-password"
      />
      <Link href={{ pathname: "/password-dimenticata", params: email ? { email: email.trim() } : {} }} asChild>
        <Button
          label="Password dimenticata?"
          variant="ghost"
          style={{ alignSelf: "flex-start", paddingHorizontal: 0 }}
        />
      </Link>
      <View style={{ marginTop: "auto", gap: 10 }}>
        <Button
          label="Accedi"
          onPress={() => void submit()}
          loading={busy}
          disabled={!online}
          testID="pulsante-accedi"
        />
        <T variant="small" tone="ink2" center>
          L&apos;accesso resta attivo su questo dispositivo finché non esci.
        </T>
      </View>
    </Screen>
  );
}
