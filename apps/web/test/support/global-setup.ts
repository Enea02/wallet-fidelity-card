/**
 * Durante gli smoke test il cron dei wallet resta spento: altrimenti pg_cron chiamerebbe il server
 * di sviluppo (se acceso) e lavorerebbe sugli stessi dati dei test. Riacceso alla fine.
 */
import { execFileSync } from "node:child_process";

async function setCron(active: boolean) {
  const status = JSON.parse(
    execFileSync("supabase", ["status", "-o", "json"], { stdio: ["ignore", "pipe", "ignore"] }).toString(),
  ) as Record<string, string>;
  const key = status.SERVICE_ROLE_KEY ?? "";
  await fetch(`${status.API_URL}/rest/v1/rpc/set_wallet_cron_active`, {
    method: "POST",
    headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ p_active: active }),
  });
}

export default async function setup() {
  await setCron(false);
  return () => setCron(true);
}
