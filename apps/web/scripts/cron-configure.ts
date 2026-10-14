/**
 * Configura il cron dei wallet nel Vault di Supabase: URL da chiamare ogni minuto e segreto
 * (CRON_SECRET dell'ambiente). In locale lo fa già `pnpm db:start`; in produzione, una volta:
 *
 *   pnpm cron:configure --url https://<dominio>/api/internal/cron/wallet-sync
 *
 * con le variabili dell'ambiente di produzione (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET).
 */
import { parseArgs } from "node:util";
import { requireEnv } from "@/lib/env";
import { supabaseAdmin } from "@/lib/supabase";

const { values } = parseArgs({ options: { url: { type: "string" } } });

if (!values.url || !URL.canParse(values.url)) {
  console.error("✖ indicare l'URL con --url https://<dominio>/api/internal/cron/wallet-sync");
  process.exit(1);
}
const { error } = await supabaseAdmin().rpc("configure_wallet_cron", {
  p_url: values.url,
  p_secret: requireEnv("CRON_SECRET"),
});
if (error) {
  console.error(`✖ ${error.message}`);
  process.exit(1);
}
console.log(`✔ Cron dei wallet configurato: ogni minuto verso ${values.url}.`);
