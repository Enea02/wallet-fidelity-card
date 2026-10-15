import type { Role, StaffMember } from "@loyalty/shared/api";
import type { z } from "zod";
import { useState } from "react";
import { View } from "react-native";
import { ago, plural } from "@/features/owner/format";
import { LoadState } from "@/features/owner/Loading";
import { useApi } from "@/features/owner/useApi";
import { api, ApiError } from "@/lib/api";
import { useOnline } from "@/lib/network";
import { useSession, useShop } from "@/lib/session";
import { isEmail } from "@/lib/validation";
import { Banner } from "@/ui/Banner";
import { Button } from "@/ui/Button";
import { Card } from "@/ui/Card";
import { Chip } from "@/ui/Chip";
import { ErrorNotice } from "@/ui/ErrorNotice";
import { Screen } from "@/ui/Screen";
import { Sheet } from "@/ui/Sheet";
import { T } from "@/ui/Text";
import { TextField } from "@/ui/TextField";
import { fonts, space, useTheme } from "@/ui/theme";

type Member = z.output<typeof StaffMember>;
const ROLE: Record<Role, string> = { owner: "Titolare", operator: "Operatore" };

const initials = (name: string) =>
  name
    .split(/[\s@]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join("");

/** Riga del design T4: "Operatore · 412 timbri", "Invito inviato 2 giorni fa". */
const meta = (m: Member) =>
  m.invitePending
    ? `Invito inviato ${m.invitedAt ? ago(m.invitedAt) : ""} · in attesa`.trim()
    : `${ROLE[m.role]} · ${plural(m.stampsGiven, "timbro dato", "timbri dati")}`;

/**
 * Staff (design T4): invito con email, ruolo, rimozione con conferma, reinvio dell'invito.
 * L'ultimo titolare non si può rimuovere né declassare (E_LAST_OWNER dal backend).
 */
export default function Staff() {
  const shop = useShop();
  const { user } = useSession();
  const online = useOnline();
  const t = useTheme();
  const staff = useApi("staff", { shopId: shop.id });
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("operator");
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [removing, setRemoving] = useState<Member | null>(null);

  const emailError = tried && !isEmail(email) ? "Scrivi un'email valida, ad esempio nome@email.it." : null;
  const nameError = tried && name.trim().length < 2 ? "Scrivi il nome con cui comparirà nei registri." : null;

  async function act(key: string, fn: () => Promise<string | null>) {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      setNotice(await fn());
      await staff.reload();
    } catch (e) {
      if (!(e instanceof ApiError)) throw e;
      setError(e);
    } finally {
      setBusy(null);
    }
  }

  const invite = () => {
    setTried(true);
    if (!isEmail(email) || name.trim().length < 2) return;
    void act("invite", async () => {
      const r = await api.call("invite", {
        shopId: shop.id,
        body: { email: email.trim(), displayName: name.trim(), role },
      });
      setEmail("");
      setName("");
      setTried(false);
      return r.existingAccount
        ? `${r.member.displayName} aveva già un account: è stato aggiunto e può entrare subito.`
        : `Invito inviato a ${r.member.displayName}: riceverà un'email per scegliere la password.`;
    });
  };

  return (
    <Screen maxWidth={760}>
      <T variant="title" accessibilityRole="header">
        Staff
      </T>
      <Card style={{ gap: space.md }}>
        <T variant="bodyStrong">Invita con email</T>
        <TextField
          label="Email"
          value={email}
          onChangeText={setEmail}
          placeholder="nome@email.it"
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="off"
          error={emailError}
          testID="invito-email"
        />
        <TextField
          label="Nome"
          value={name}
          onChangeText={setName}
          placeholder="Sara"
          maxLength={40}
          error={nameError}
          testID="invito-nome"
        />
        <View
          style={{ flexDirection: "row", gap: space.sm, alignItems: "center", flexWrap: "wrap" }}
          accessibilityRole="radiogroup"
        >
          <T variant="small" tone="ink2">
            Ruolo:
          </T>
          <Chip
            label="Operatore"
            selected={role === "operator"}
            onPress={() => setRole("operator")}
            testID="invito-operatore"
          />
          <Chip
            label="Titolare"
            selected={role === "owner"}
            onPress={() => setRole("owner")}
            testID="invito-titolare"
          />
        </View>
        <T variant="small" tone="ink2">
          {role === "operator"
            ? "L'operatore dà timbri e riscatta premi; non vede clienti, statistiche e impostazioni."
            : "Il titolare può fare tutto, compresi staff, impostazioni e promozioni."}
        </T>
        <Button
          label="Invita"
          onPress={invite}
          loading={busy === "invite"}
          disabled={!online || busy !== null}
          testID="invita"
        />
      </Card>

      {notice ? <Banner tone="success">{notice}</Banner> : null}
      {error ? <ErrorNotice error={error} /> : null}

      {!staff.data ? (
        <LoadState error={staff.error} onRetry={() => void staff.reload()} />
      ) : (
        <View style={{ gap: 0 }}>
          {staff.data.staff.map((m) => {
            const me = m.userId === user?.id;
            return (
              <View
                key={m.userId}
                testID={`membro-${m.displayName}`}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: space.md,
                  paddingVertical: space.md,
                  borderBottomWidth: 1,
                  borderBottomColor: t.line,
                  flexWrap: "wrap",
                }}
              >
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 20,
                    backgroundColor: t.surface2,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <T style={{ fontFamily: fonts.bold, fontSize: 14 }}>{initials(m.displayName)}</T>
                </View>
                <View style={{ flex: 1, minWidth: 160 }}>
                  <T variant="bodyStrong">
                    {m.displayName}
                    {me ? <T tone="ink2"> (tu)</T> : null}
                  </T>
                  <T variant="small" tone="ink2">
                    {m.email ? `${m.email} · ` : ""}
                    {meta(m)}
                  </T>
                </View>
                <View style={{ flexDirection: "row", gap: space.sm }}>
                  {m.invitePending ? (
                    <Button
                      label="Reinvia"
                      variant="ghost"
                      disabled={!online || busy !== null}
                      onPress={() =>
                        void act(`resend-${m.userId}`, async () => {
                          await api.call("resendInvite", { shopId: shop.id, params: { userId: m.userId } });
                          return `Invito inviato di nuovo a ${m.displayName}.`;
                        })
                      }
                      testID={`reinvia-${m.displayName}`}
                    />
                  ) : null}
                  {!me ? (
                    <Button
                      label={m.role === "owner" ? "Rendi operatore" : "Rendi titolare"}
                      variant="ghost"
                      disabled={!online || busy !== null}
                      onPress={() =>
                        void act(`role-${m.userId}`, async () => {
                          const next: Role = m.role === "owner" ? "operator" : "owner";
                          await api.call("updateStaff", {
                            shopId: shop.id,
                            params: { userId: m.userId },
                            body: { role: next },
                          });
                          return `${m.displayName} ora è ${ROLE[next].toLowerCase()}.`;
                        })
                      }
                      testID={`ruolo-${m.displayName}`}
                    />
                  ) : null}
                  <Button
                    label="Rimuovi"
                    variant="ghost"
                    disabled={!online || busy !== null}
                    onPress={() => setRemoving(m)}
                    labelColor={t.danger}
                    testID={`rimuovi-${m.displayName}`}
                  />
                </View>
              </View>
            );
          })}
        </View>
      )}

      <Sheet visible={removing !== null} onClose={() => setRemoving(null)} testID="foglio-rimozione">
        <T variant="subtitle">Rimuovere {removing?.displayName}?</T>
        <T tone="ink2">
          {removing?.userId === user?.id
            ? "Perderai l'accesso a questo negozio dall'app."
            : "Non potrà più dare timbri in questo negozio. I timbri già dati restano nello storico."}
        </T>
        <View style={{ flexDirection: "row", gap: space.md }}>
          <Button label="Annulla" variant="secondary" onPress={() => setRemoving(null)} style={{ flex: 1 }} />
          <Button
            label="Rimuovi"
            variant="danger"
            loading={busy === "remove"}
            style={{ flex: 1 }}
            testID="conferma-rimozione"
            onPress={() => {
              const m = removing;
              setRemoving(null);
              if (m)
                void act("remove", async () => {
                  await api.call("removeStaff", { shopId: shop.id, params: { userId: m.userId } });
                  return `${m.displayName} non fa più parte dello staff.`;
                });
            }}
          />
        </View>
      </Sheet>
    </Screen>
  );
}
