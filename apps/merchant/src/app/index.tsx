import { router, type Href } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { homeFor } from "@/lib/navigation/sections";
import { useSession } from "@/lib/session";
import { Button } from "@/ui/Button";
import { ErrorNotice } from "@/ui/ErrorNotice";
import { Screen } from "@/ui/Screen";
import { T } from "@/ui/Text";
import { useTheme } from "@/ui/theme";

/** Smistamento in base allo stato della sessione. */
export default function Index() {
  const { status, role, error, reload, signOut, user } = useSession();
  const t = useTheme();

  // reindirizzamento dopo il montaggio: un <Redirect> durante il primo render arriva prima che
  // il navigatore sia pronto (avviso di React all'avvio su mobile)
  const target: Href | null =
    status === "signedOut"
      ? "/accedi"
      : status === "chooseShop"
        ? "/negozi"
        : status === "ready" && role
          ? (`/${homeFor(role)}` as Href)
          : null;
  useEffect(() => {
    if (target) router.replace(target);
  }, [target]);

  if (status === "noShops") {
    return (
      <Screen fill>
        <T variant="title">Nessun negozio collegato</T>
        <T tone="ink2">
          {`L'account ${user?.email ?? ""} non fa parte dello staff di nessun negozio. Chiedi al titolare di invitarti con questa email.`}
        </T>
        <View style={{ marginTop: "auto" }}>
          <Button label="Esci" variant="secondary" onPress={() => void signOut()} />
        </View>
      </Screen>
    );
  }

  if (status === "error") {
    return (
      <Screen fill>
        <T variant="title">Non riesco a caricare i tuoi negozi</T>
        {error ? <ErrorNotice error={error} /> : null}
        <View style={{ marginTop: "auto", gap: 10 }}>
          <Button label="Riprova" onPress={() => void reload()} />
          <Button label="Esci" variant="secondary" onPress={() => void signOut()} />
        </View>
      </Screen>
    );
  }

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: t.bg }}>
      <ActivityIndicator color={t.accentText} size="large" accessibilityLabel="Caricamento" />
    </View>
  );
}
