/**
 * Risincronizza con Google Wallet una carta o tutto un negozio (fino al pulsante "Risincronizza"
 * della vista Assistenza, Fase 9). Esito nelle righe wallet.google.* stampate qui sotto.
 *
 *   pnpm wallet:resync --shop salone-demo                    template + tutte le carte
 *   pnpm wallet:resync --shop salone-demo --card DEMA2345    una sola carta
 *
 * Usa le variabili di apps/web/.env.local (in produzione: quelle dell'ambiente).
 */
import { parseArgs } from "node:util";
import { newRequestId } from "@loyalty/shared/logging/request-id";
import { runWithContext } from "@/lib/observability/context";
import { supabaseAdmin } from "@/lib/supabase";
import { googleEnabled } from "@/lib/wallet/google/config";
import { resyncShop, syncCard } from "@/lib/wallet/sync";

const { values } = parseArgs({ options: { shop: { type: "string" }, card: { type: "string" } } });

function fail(message: string): never {
  console.error(`✖ ${message}`);
  process.exit(1);
}

async function main() {
  if (!googleEnabled()) fail("Google Wallet non configurato (GOOGLE_WALLET_ISSUER_ID e GOOGLE_WALLET_SA_KEY_B64)");
  if (!values.shop) fail("indicare il negozio con --shop <slug>");
  const db = supabaseAdmin();
  const { data: shop } = await db.from("shops").select("id, name").eq("slug", values.shop).maybeSingle();
  if (!shop) fail(`negozio "${values.shop}" non trovato`);

  await runWithContext(
    { request_id: newRequestId(), shop_id: shop.id as string, platform: "script", role: "support" },
    async () => {
      if (values.card) {
        const { data: c } = await db
          .from("customers")
          .select("id")
          .eq("shop_id", shop.id)
          .eq("short_code", values.card!.toUpperCase())
          .maybeSingle();
        if (!c) fail(`carta ${values.card} non trovata nel negozio ${values.shop}`);
        const ok = await syncCard(c.id as string, { origin: "resync" });
        console.log(ok ? "✔ Carta risincronizzata." : "✖ Risincronizzazione fallita: vedi la riga di errore sopra.");
        return;
      }
      const r = await resyncShop(shop.id as string);
      console.log(
        `✔ Negozio ${shop.name}: template ${r.classOk ? "ok" : "in errore"}, ${r.ok}/${r.cards} carte risincronizzate.`,
      );
    },
  );
}

await main();
