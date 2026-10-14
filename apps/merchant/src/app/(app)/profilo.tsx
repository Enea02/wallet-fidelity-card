import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { api, ApiError } from "@/lib/api";
import { app, config } from "@/lib/config";
import { deviceLabel } from "@/lib/diagnostics/device";
import { sendDiagnostics } from "@/lib/diagnostics/send";
import { useOnline } from "@/lib/network";
import { useSession, useShop } from "@/lib/session";
import { Banner } from "@/ui/Banner";
import { Button } from "@/ui/Button";
import { Card } from "@/ui/Card";
import { ErrorNotice } from "@/ui/ErrorNotice";
import { Screen } from "@/ui/Screen";
import { SupportCode } from "@/ui/SupportCode";
import { T } from "@/ui/Text";
import { space, useTheme } from "@/ui/theme";

const ROLE = { owner: "titolare", operator: "operatore" } as const;
const PLATFORM = { ios: "iOS", android: "Android", web: "Web" } as const;

/** Cliente inesistente: il server risponde con un errore vero del catalogo (E_CARD_NOT_FOUND). */
const MISSING_CUSTOMER = "00000000-0000-4000-8000-000000000000";

function Row({ label, value, testID }: { label: string; value: string; testID?: string }) {
  const t = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        gap: space.md,
        paddingVertical: 6,
        borderBottomWidth: 1,
        borderBottomColor: t.line,
      }}
    >
      <T variant="small" tone="ink2">
        {label}
      </T>
      <T variant="small" style={{ flexShrink: 1, textAlign: "right" }} {...(testID !== undefined && { testID })}>
        {value}
      </T>
    </View>
  );
}

export default function Profilo() {
  const { user, shops, signOut } = useSession();
  const shop = useShop();
  const online = useOnline();
  const [sending, setSending] = useState(false);
  const [ticket, setTicket] = useState<string | null>(null);
  const [sendError, setSendError] = useState<ApiError | null>(null);
  const [forced, setForced] = useState<ApiError | null>(null);
  const device = deviceLabel();

  async function send() {
    setSending(true);
    setSendError(null);
    try {
      setTicket(await sendDiagnostics(shop.id));
    } catch (e) {
      if (e instanceof ApiError) setSendError(e);
      else throw e;
    } finally {
      setSending(false);
    }
  }

  async function forceError() {
    setForced(null);
    try {
      await api.call("stamp", { shopId: shop.id, body: { customerId: MISSING_CUSTOMER } });
    } catch (e) {
      if (e instanceof ApiError) setForced(e);
      else throw e;
    }
  }

  return (
    <Screen maxWidth={640}>
      <T variant="title" accessibilityRole="header">
        Profilo
      </T>

      <Card>
        <Row label="Nome" value={shop.displayName || "—"} />
        <Row label="Email" value={user?.email ?? "—"} />
        <Row label="Negozio" value={shop.name} testID="profilo-negozio" />
        <Row label="Ruolo" value={ROLE[shop.role]} testID="profilo-ruolo" />
        <Row label="App" value={`${app.version} (build ${app.build}) · ${PLATFORM[app.platform]}`} />
        <Row label="Dispositivo" value={`${device.device} · ${device.os_version}`} />
      </Card>

      {shops.length > 1 ? (
        <Button
          label="Cambia negozio"
          variant="secondary"
          onPress={() => router.push("/negozi")}
          testID="cambia-negozio"
        />
      ) : null}

      <Card>
        <T variant="subtitle">Assistenza</T>
        <T variant="small" tone="ink2">
          Se qualcosa non funziona, invia la diagnostica e comunica il codice ticket all&apos;assistenza. Contiene gli
          ultimi eventi dell&apos;app e il tipo di dispositivo, nessun dato dei clienti.
        </T>
        {ticket ? (
          <Banner tone="success" title="Diagnostica inviata">
            <SupportCode code={ticket} label="Codice ticket" />
          </Banner>
        ) : null}
        {sendError ? <ErrorNotice error={sendError} title="Diagnostica non inviata" /> : null}
        <Button
          label="Invia diagnostica all'assistenza"
          variant="secondary"
          onPress={() => void send()}
          loading={sending}
          disabled={!online}
          testID="invia-diagnostica"
        />
      </Card>

      {config.env !== "production" ? (
        <Card>
          <T variant="subtitle">Strumenti di prova</T>
          <T variant="small" tone="ink2">
            Solo nelle build di sviluppo e test. Manda al server un timbro per una carta inesistente: deve comparire il
            codice assistenza, ritrovabile nei log del backend.
          </T>
          {forced ? <ErrorNotice error={forced} /> : null}
          <Button label="Forza un errore" variant="secondary" onPress={() => void forceError()} testID="forza-errore" />
        </Card>
      ) : null}

      <Button label="Esci" variant="danger" onPress={() => void signOut()} testID="esci" />
    </Screen>
  );
}
