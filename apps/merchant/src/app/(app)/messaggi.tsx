import type { Promotion } from "@loyalty/shared/api";
import { cardColors } from "@loyalty/shared/theme";
import type { z } from "zod";
import { useState } from "react";
import { useWindowDimensions, View } from "react-native";
import { dateTime, longDate, nextPromoAllowed, plural } from "@/features/owner/format";
import { LoadState } from "@/features/owner/Loading";
import { useApi } from "@/features/owner/useApi";
import { api, ApiError } from "@/lib/api";
import { useOnline } from "@/lib/network";
import { useShop } from "@/lib/session";
import { Banner } from "@/ui/Banner";
import { Button } from "@/ui/Button";
import { Card } from "@/ui/Card";
import { ErrorNotice } from "@/ui/ErrorNotice";
import { Monogram } from "@/ui/Monogram";
import { Screen } from "@/ui/Screen";
import { Sheet } from "@/ui/Sheet";
import { T } from "@/ui/Text";
import { TextField } from "@/ui/TextField";
import { fonts, radius, space, useTheme } from "@/ui/theme";

const MAX = 140;
type Promo = z.output<typeof Promotion>;
const STATUS: Record<Promo["status"], string> = {
  queued: "in coda",
  sending: "in invio",
  sent: "inviata",
  cancelled: "annullata",
};

/** Anteprima della notifica come arriva sul telefono (design T4): iPhone e Android. */
function NotificationPreview({
  text,
  shopName,
  hexColor,
  logoUrl,
}: {
  text: string;
  shopName: string;
  hexColor: string;
  logoUrl: string | null;
}) {
  const t = useTheme();
  const c = cardColors(hexColor.toUpperCase());
  const body = text.trim() || "Il testo del messaggio comparirà qui.";
  return (
    <View style={{ gap: space.md }}>
      <View style={{ backgroundColor: "#1C1C1E", borderRadius: radius.card, padding: space.lg, gap: space.sm }}>
        <View style={{ backgroundColor: "rgba(255,255,255,0.14)", borderRadius: 16, padding: space.md, gap: 4 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
            <Monogram name={shopName} logoUrl={logoUrl} bg={c.bg} fg={c.fg} size={22} />
            <T style={{ color: "#FFFFFF", fontFamily: fonts.semibold, fontSize: 13, flex: 1 }} numberOfLines={1}>
              {shopName}
            </T>
            <T style={{ color: "rgba(255,255,255,0.6)", fontSize: 12 }}>ora</T>
          </View>
          <T style={{ color: "#FFFFFF", fontSize: 14, lineHeight: 19 }} testID="anteprima-notifica">
            {body}
          </T>
        </View>
        <T style={{ color: "rgba(255,255,255,0.6)", fontSize: 11 }} center>
          iPhone · schermata di blocco
        </T>
      </View>
      <View
        style={{
          backgroundColor: t.surface,
          borderRadius: radius.card,
          borderWidth: 1,
          borderColor: t.line,
          padding: space.md,
          gap: 4,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
          <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: c.bg }} />
          <T variant="small" tone="ink2">
            Google Wallet · {shopName}
          </T>
        </View>
        <T style={{ fontSize: 14 }}>{body}</T>
        <T variant="label" tone="ink3" style={{ letterSpacing: 0 }}>
          Android · notifica del messaggio sulla carta
        </T>
      </View>
    </View>
  );
}

/**
 * Messaggi promozionali (design T4): arrivano come notifica sulla carta nel wallet dei clienti
 * con consenso marketing. Una a settimana (E_PROMO_WEEKLY_LIMIT), invio subito; li consegna il cron.
 */
export default function Messaggi() {
  const t = useTheme();
  const shop = useShop();
  const online = useOnline();
  const { width } = useWindowDimensions();
  const wide = width >= 1000;
  const stats = useApi("stats", { shopId: shop.id });
  const promos = useApi("promotions", { shopId: shop.id });
  const [text, setText] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [sent, setSent] = useState<string | null>(null);

  const recipients = stats.data?.customersMarketing ?? 0;
  const total = stats.data?.customersTotal ?? 0;
  const last = promos.data?.promotions.find((p) => p.status !== "cancelled") ?? null;
  const next = nextPromoAllowed(last?.createdAt ?? null);
  const canSend = online && text.trim().length > 0 && recipients > 0 && !next && !busy;

  async function send() {
    setConfirm(false);
    setBusy(true);
    setError(null);
    try {
      const r = await api.call("queuePromotion", { shopId: shop.id, body: { text: text.trim() } });
      setSent(
        `Messaggio in coda per ${plural(r.promotion.recipients, "cliente", "clienti")}: arriva sulle carte entro qualche minuto.`,
      );
      setText("");
      await promos.reload();
    } catch (e) {
      if (!(e instanceof ApiError)) throw e;
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  const composer = (
    <View style={{ gap: space.lg }}>
      <View style={{ gap: 4 }}>
        <T variant="title" accessibilityRole="header">
          Messaggio promozionale
        </T>
        <T tone="ink2">Arriva come notifica sulla carta nel wallet. Massimo uno a settimana.</T>
      </View>
      <TextField
        label="Testo"
        value={text}
        onChangeText={(v) => {
          setText(v.slice(0, MAX));
          setSent(null);
        }}
        multiline
        numberOfLines={3}
        maxLength={MAX}
        placeholder="Ottobre da Nora: piega + trattamento ristrutturante a 35 €. Prenota al 051 123456."
        hint={`Breve e concreto: cosa, quanto, come prenotare. ${text.length} / ${MAX}`}
        style={{ minHeight: 96, textAlignVertical: "top", paddingTop: space.md }}
        testID="testo-promo"
      />
      {stats.data ? (
        <Card style={{ flexDirection: "row", alignItems: "center", gap: space.lg }}>
          <T variant="number" style={{ fontSize: 40, lineHeight: 44 }} testID="destinatari">
            {recipients}
          </T>
          <View style={{ flex: 1 }}>
            <T variant="bodyStrong">destinatari con consenso marketing</T>
            <T variant="small" tone="ink2">
              su {plural(total, "cliente", "clienti")} ·{" "}
              {total - recipients === 1
                ? "l'altro non riceverà nulla"
                : `gli altri ${total - recipients} non riceveranno nulla`}
            </T>
          </View>
        </Card>
      ) : (
        <LoadState error={stats.error} onRetry={() => void stats.reload()} />
      )}
      {next ? (
        <Banner tone="info" title="Hai già inviato il messaggio di questa settimana">
          {`Ultimo invio: ${longDate(last!.createdAt)}. Il prossimo è possibile dal ${longDate(next.toISOString())}.`}
        </Banner>
      ) : null}
      {recipients === 0 && stats.data ? (
        <Banner tone="info">Nessun cliente ha ancora dato il consenso alle promozioni: lo danno iscrivendosi.</Banner>
      ) : null}
      {sent ? <Banner tone="success">{sent}</Banner> : null}
      {error ? <ErrorNotice error={error} /> : null}
      <Button
        label={`Invia a ${plural(recipients, "cliente", "clienti")}`}
        onPress={() => setConfirm(true)}
        loading={busy}
        disabled={!canSend}
        testID="invia-promo"
      />

      <View style={{ gap: space.xs }}>
        <T variant="bodyStrong">Invii precedenti</T>
        {!promos.data ? (
          <LoadState error={promos.error} onRetry={() => void promos.reload()} />
        ) : promos.data.promotions.length === 0 ? (
          <T tone="ink2">Nessun messaggio inviato finora.</T>
        ) : (
          promos.data.promotions.map((p) => (
            <View
              key={p.id}
              style={{ paddingVertical: space.sm, borderBottomWidth: 1, borderBottomColor: t.line, gap: 2 }}
              testID="promo-storico"
            >
              <T numberOfLines={2}>{p.text}</T>
              <T variant="small" tone="ink2">
                {dateTime(p.createdAt)} · {STATUS[p.status]} · {plural(p.recipients, "destinatario", "destinatari")}
              </T>
            </View>
          ))
        )}
      </View>
    </View>
  );

  const preview = (
    <View style={{ gap: space.sm }}>
      <T variant="bodyStrong">Anteprima notifica</T>
      <NotificationPreview text={text} shopName={shop.name} hexColor={shop.hexColor} logoUrl={shop.logoUrl} />
    </View>
  );

  return (
    <Screen maxWidth={wide ? 1100 : 640}>
      {wide ? (
        <View style={{ flexDirection: "row", gap: space.xxl, alignItems: "flex-start" }}>
          <View style={{ flex: 1.2 }}>{composer}</View>
          <View style={{ flex: 1 }}>{preview}</View>
        </View>
      ) : (
        <>
          {composer}
          {preview}
        </>
      )}
      <Sheet visible={confirm} onClose={() => setConfirm(false)} testID="foglio-promo">
        <T variant="subtitle">Inviare il messaggio a {plural(recipients, "cliente", "clienti")}?</T>
        <T tone="ink2">
          Arriva come notifica sulla loro carta. Fino alla prossima settimana non potrai inviarne un altro.
        </T>
        <View style={{ flexDirection: "row", gap: space.md }}>
          <Button label="Annulla" variant="secondary" onPress={() => setConfirm(false)} style={{ flex: 1 }} />
          <Button label="Invia" onPress={() => void send()} style={{ flex: 1 }} testID="conferma-promo" />
        </View>
      </Sheet>
    </Screen>
  );
}
