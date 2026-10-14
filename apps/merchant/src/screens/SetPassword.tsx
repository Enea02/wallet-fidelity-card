import * as Linking from "expo-linking";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Platform, View, type TextInput } from "react-native";
import { authFailure } from "@/lib/auth/errors";
import { authParamsFromUrl, supabase } from "@/lib/auth/supabase";
import { log } from "@/lib/diagnostics/logger";
import { useOnline } from "@/lib/network";
import { useSession } from "@/lib/session";
import { passwordProblem, PASSWORD_MIN } from "@/lib/validation";
import { Banner } from "@/ui/Banner";
import { Button } from "@/ui/Button";
import { Screen } from "@/ui/Screen";
import { StampHero } from "@/ui/StampHero";
import { T } from "@/ui/Text";
import { TextField } from "@/ui/TextField";
import { useTheme } from "@/ui/theme";

/*
 * Accettazione dell'invito e nuova password: il link dell'email (Supabase, flusso implicit)
 * porta i token nel frammento #access_token=…&refresh_token=…&type=invite|recovery.
 * Arriva come link web (/invito, /nuova-password) o come deep link loyaltywallet://invito.
 */

type Kind = "invito" | "recupero";
type Phase = "checking" | "invalid" | "form";

/** Toglie i token dalla barra degli indirizzi (non restano nella cronologia del browser). */
function clearUrlTokens() {
  if (Platform.OS === "web" && typeof window !== "undefined" && window.location.hash) {
    window.history.replaceState(null, "", window.location.pathname);
  }
}

export function SetPassword({ kind }: { kind: Kind }) {
  const t = useTheme();
  const url = Linking.useLinkingURL();
  const online = useOnline();
  const { reload } = useSession();
  const [phase, setPhase] = useState<Phase>("checking");
  const [email, setEmail] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const confirmRef = useRef<TextInput>(null);
  const handled = useRef<string | null>(null);

  useEffect(() => {
    const current = Platform.OS === "web" && typeof window !== "undefined" ? window.location.href : url;
    if (handled.current === current) return;
    handled.current = current ?? "";
    void (async () => {
      const p = authParamsFromUrl(current ?? "");
      if (p.error) {
        clearUrlTokens();
        setPhase("invalid");
        return;
      }
      if (p.accessToken && p.refreshToken) {
        const { data, error } = await supabase.auth.setSession({
          access_token: p.accessToken,
          refresh_token: p.refreshToken,
        });
        clearUrlTokens();
        if (error || !data.user) {
          setPhase("invalid");
          return;
        }
        setEmail(data.user.email ?? null);
        if (kind === "invito") log.event("app.invite.accepted", { email: data.user.email ?? "sconosciuta" });
        setPhase("form");
        return;
      }
      // pagina ricaricata dopo aver già letto il link: basta la sessione aperta
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        setEmail(data.session.user.email ?? null);
        setPhase("form");
      } else setPhase("invalid");
    })();
  }, [url, kind]);

  async function submit() {
    const problems = passwordProblem(password, confirm);
    setErrors(problems);
    if (problems.password || problems.confirm) return;
    setBusy(true);
    setFailure(null);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setBusy(false);
      setFailure(authFailure(error).userMessage);
      return;
    }
    log.event("app.password.changed", { via: kind });
    await reload();
    setBusy(false);
    router.replace("/");
  }

  if (phase === "checking") {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: t.bg }}>
        <ActivityIndicator color={t.accentText} size="large" accessibilityLabel="Verifica del link" />
      </View>
    );
  }

  if (phase === "invalid") {
    return (
      <Screen fill>
        <T variant="title" accessibilityRole="header">
          Link scaduto o già usato
        </T>
        <T tone="ink2">
          {kind === "invito"
            ? "Questo invito non è più valido. Chiedi al titolare di inviartene uno nuovo dalla sezione Staff."
            : "Il link per la nuova password vale un'ora e si usa una volta sola. Chiedine uno nuovo."}
        </T>
        <View style={{ marginTop: "auto", gap: 10 }}>
          {kind === "recupero" ? (
            <Button label="Chiedi un nuovo link" onPress={() => router.replace("/password-dimenticata")} />
          ) : null}
          <Button label="Vai all'accesso" variant="secondary" onPress={() => router.replace("/accedi")} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen fill>
      <StampHero />
      <View style={{ gap: 6 }}>
        <T variant="title" accessibilityRole="header">
          {kind === "invito" ? "Ti diamo il benvenuto" : "Nuova password"}
        </T>
        <T tone="ink2">
          {kind === "invito"
            ? `Scegli la password per accedere${email ? ` con ${email}` : ""}. La userai su telefono, tablet e computer.`
            : `Scegli la nuova password${email ? ` per ${email}` : ""}.`}
        </T>
      </View>
      {failure ? <Banner tone="danger">{failure}</Banner> : null}
      <TextField
        label="Password"
        value={password}
        onChangeText={setPassword}
        error={errors.password ?? null}
        hint={`Almeno ${PASSWORD_MIN} caratteri.`}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="next"
        onSubmitEditing={() => confirmRef.current?.focus()}
      />
      <TextField
        ref={confirmRef}
        label="Ripeti la password"
        value={confirm}
        onChangeText={setConfirm}
        error={errors.confirm ?? null}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="go"
        onSubmitEditing={() => void submit()}
      />
      <View style={{ marginTop: "auto" }}>
        <Button
          label={kind === "invito" ? "Salva e entra" : "Salva la password"}
          onPress={() => void submit()}
          loading={busy}
          disabled={!online}
        />
      </View>
    </Screen>
  );
}
