import type { PrepaidProduct } from "@loyalty/shared/api";
import type { z } from "zod";
import { useState } from "react";
import { View } from "react-native";
import { pdfActions } from "@/features/owner/counter-qr/pdf";
import { draftProblems, EMPTY_DRAFT, type Draft } from "@/features/prepaid/product-form";
import { LoadState } from "@/features/owner/Loading";
import { useApi } from "@/features/owner/useApi";
import { api, ApiError } from "@/lib/api";
import { config } from "@/lib/config";
import { useOnline } from "@/lib/network";
import { useShop } from "@/lib/session";
import { Banner } from "@/ui/Banner";
import { Button } from "@/ui/Button";
import { Card } from "@/ui/Card";
import { Chip } from "@/ui/Chip";
import { ErrorNotice } from "@/ui/ErrorNotice";
import { Screen } from "@/ui/Screen";
import { Sheet } from "@/ui/Sheet";
import { T } from "@/ui/Text";
import { TextField } from "@/ui/TextField";
import { space, useTheme } from "@/ui/theme";

type Product = z.output<typeof PrepaidProduct>;

const VALIDITY: Array<{ label: string; value: number | null }> = [
  { label: "Nessuna", value: null },
  { label: "3 mesi", value: 3 },
  { label: "6 mesi", value: 6 },
  { label: "12 mesi", value: 12 },
  { label: "24 mesi", value: 24 },
];

/**
 * Tessere prepagate (Fase 9.5): il titolare crea i tipi di tessera che i clienti si creano dal QR
 * e che lo staff attiva in cassa dopo il pagamento. Ogni tessera ha il suo indirizzo e il suo cartello.
 */
export default function Tessere() {
  const shop = useShop();
  const online = useOnline();
  const t = useTheme();
  const products = useApi("prepaidProducts", { shopId: shop.id });
  const [editing, setEditing] = useState<Product | "new" | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const problems = tried ? draftProblems(draft) : {};
  const open = (p: Product | "new") => {
    setEditing(p);
    setTried(false);
    setError(null);
    setDraft(
      p === "new"
        ? EMPTY_DRAFT
        : {
            name: p.name,
            units: String(p.units),
            unitSingular: p.unitSingular,
            unitPlural: p.unitPlural,
            validityMonths: p.validityMonths,
          },
    );
  };

  async function act(key: string, fn: () => Promise<string>) {
    setBusy(key);
    setError(null);
    setDone(null);
    try {
      setDone(await fn());
      await products.reload();
    } catch (e) {
      if (!(e instanceof ApiError)) throw e;
      setError(e);
    } finally {
      setBusy(null);
    }
  }

  function save() {
    setTried(true);
    if (Object.keys(draftProblems(draft)).length > 0 || editing === null) return;
    const body = {
      name: draft.name.trim(),
      units: Number(draft.units),
      unitSingular: draft.unitSingular.trim(),
      unitPlural: draft.unitPlural.trim(),
      validityMonths: draft.validityMonths,
    };
    const target = editing;
    void act("save", async () => {
      if (target === "new") {
        const r = await api.call("createPrepaidProduct", { shopId: shop.id, body });
        setEditing(null);
        return `Tessera «${r.product.name}» creata: stampa il suo cartello per farla conoscere ai clienti.`;
      }
      const r = await api.call("updatePrepaidProduct", { shopId: shop.id, params: { id: target.id }, body });
      setEditing(null);
      return `Tessera «${r.product.name}» aggiornata.`;
    });
  }

  async function sign(p: Product, kind: "share" | "print") {
    await act(`sign-${p.id}`, async () => {
      const pdf = await api.call("counterQr", { shopId: shop.id, query: { product: p.id } });
      const file = `cartello-${shop.slug}-${p.code}.pdf`;
      if (kind === "share") await pdfActions.share(pdf, file);
      else await pdfActions.print(pdf, file);
      return pdfActions.canShare ? "" : `Scaricato ${file}: aprilo per stamparlo in A5.`;
    });
  }

  return (
    <Screen maxWidth={760}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md }}>
        <T variant="title" accessibilityRole="header" style={{ flex: 1 }}>
          Tessere prepagate
        </T>
        <Button label="Nuova tessera" onPress={() => open("new")} disabled={!online} testID="nuova-tessera" />
      </View>
      <T tone="ink2">
        Il cliente si crea la tessera dal QR, la paga in cassa e voi la attivate dallo scanner. A ogni utilizzo scalate
        le unità usate; a fine tessera la ricaricate sulla stessa carta.
      </T>

      {done ? <Banner tone="success">{done}</Banner> : null}
      {error && editing === null ? <ErrorNotice error={error} /> : null}

      {!products.data ? (
        <LoadState error={products.error} onRetry={() => void products.reload()} />
      ) : products.data.products.length === 0 ? (
        <Card>
          <T tone="ink2">Nessuna tessera ancora. Ad esempio: «Tessera fotocopie», 150 pagine, valida 12 mesi.</T>
        </Card>
      ) : (
        products.data.products.map((p) => (
          <Card key={p.id} style={{ gap: space.sm }} testID={`tessera-${p.code}`}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
              <T variant="subtitle" style={{ flex: 1 }}>
                {p.name}
              </T>
              <View
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 2,
                  borderRadius: 999,
                  backgroundColor: p.active ? t.successSoft : t.surface2,
                }}
              >
                <T variant="label">{p.active ? "Disponibile" : "Non disponibile"}</T>
              </View>
            </View>
            <T tone="ink2">
              {p.units} {p.units === 1 ? p.unitSingular : p.unitPlural} ·{" "}
              {p.validityMonths ? `valida ${p.validityMonths} mesi` : "senza scadenza"} · {p.cards.pending} da attivare
              · {p.cards.active} attive
            </T>
            <T variant="small" tone="ink3">
              {`${config.apiUrl.replace(/^https?:\/\//, "")}/${shop.slug}/t/${p.code}`}
            </T>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
              <Button label="Modifica" variant="secondary" onPress={() => open(p)} disabled={!online} />
              <Button
                label={pdfActions.canShare ? "Condividi cartello" : "Scarica cartello"}
                variant="secondary"
                onPress={() => void sign(p, "share")}
                loading={busy === `sign-${p.id}`}
                disabled={!online || busy !== null}
                testID={`cartello-${p.code}`}
              />
              <Button
                label={p.active ? "Rendi non disponibile" : "Rendi disponibile"}
                variant="ghost"
                disabled={!online || busy !== null}
                onPress={() =>
                  void act(`toggle-${p.id}`, async () => {
                    await api.call("updatePrepaidProduct", {
                      shopId: shop.id,
                      params: { id: p.id },
                      body: { active: !p.active },
                    });
                    return p.active
                      ? `«${p.name}» non si può più richiedere; le tessere già create restano valide.`
                      : `«${p.name}» di nuovo disponibile.`;
                  })
                }
              />
            </View>
          </Card>
        ))
      )}

      <Sheet visible={editing !== null} onClose={() => setEditing(null)} testID="foglio-tessera">
        <T variant="subtitle">{editing === "new" ? "Nuova tessera" : "Modifica tessera"}</T>
        <TextField
          label="Nome"
          value={draft.name}
          onChangeText={(v) => setDraft({ ...draft, name: v })}
          placeholder="Tessera fotocopie"
          maxLength={40}
          error={problems.name ?? null}
          testID="tessera-nome-campo"
        />
        <TextField
          label="Unità per tessera e per ricarica"
          value={draft.units}
          onChangeText={(v) => setDraft({ ...draft, units: v.replace(/[^0-9]/g, "") })}
          keyboardType="number-pad"
          placeholder="150"
          maxLength={5}
          error={problems.units ?? null}
          testID="tessera-unita"
        />
        <View style={{ flexDirection: "row", gap: space.md }}>
          <View style={{ flex: 1 }}>
            <TextField
              label="Unità (una)"
              value={draft.unitSingular}
              onChangeText={(v) => setDraft({ ...draft, unitSingular: v })}
              placeholder="pagina"
              maxLength={20}
              error={problems.unitSingular ?? null}
              testID="tessera-singolare"
            />
          </View>
          <View style={{ flex: 1 }}>
            <TextField
              label="Unità (tante)"
              value={draft.unitPlural}
              onChangeText={(v) => setDraft({ ...draft, unitPlural: v })}
              placeholder="pagine"
              maxLength={20}
              error={problems.unitPlural ?? null}
              testID="tessera-plurale"
            />
          </View>
        </View>
        <T variant="small" tone="ink2">
          Scadenza dall&apos;attivazione o dall&apos;ultima ricarica
        </T>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }} accessibilityRole="radiogroup">
          {VALIDITY.map((v) => (
            <Chip
              key={v.label}
              label={v.label}
              selected={draft.validityMonths === v.value}
              onPress={() => setDraft({ ...draft, validityMonths: v.value })}
              testID={`scadenza-${v.value ?? "nessuna"}`}
            />
          ))}
        </View>
        {editing !== "new" && editing !== null ? (
          <T variant="small" tone="ink2">
            Le modifiche valgono per le prossime attivazioni e ricariche: il saldo delle tessere già attive non cambia.
          </T>
        ) : null}
        {error && editing !== null ? <ErrorNotice error={error} /> : null}
        <View style={{ flexDirection: "row", gap: space.md }}>
          <Button label="Annulla" variant="secondary" onPress={() => setEditing(null)} style={{ flex: 1 }} />
          <Button
            label="Salva"
            onPress={save}
            loading={busy === "save"}
            disabled={!online}
            style={{ flex: 1 }}
            testID="salva-tessera"
          />
        </View>
      </Sheet>
    </Screen>
  );
}
