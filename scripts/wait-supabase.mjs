#!/usr/bin/env node
/*
 * Aspetta che il Supabase locale sia davvero pronto: subito dopo `supabase start` il gateway (Kong)
 * può rispondere ancora 502 ("An invalid response was received from the upstream server") per
 * qualche secondo, e gli smoke test partiti in quel momento falliscono a caso.
 * Pronto = REST, Auth e Storage rispondono 200 per 5 controlli di fila (uno ogni 500 ms). Massimo 120 s.
 */
import { execFileSync } from "node:child_process";

const status = JSON.parse(execFileSync("supabase", ["status", "-o", "json"], { stdio: ["ignore", "pipe", "ignore"] }));
const api = String(status.API_URL ?? "").replace(/\/$/, "");
const key = String(status.ANON_KEY ?? "");
const headers = { apikey: key, authorization: `Bearer ${key}` };
const checks = {
  REST: `${api}/rest/v1/`,
  Auth: `${api}/auth/v1/health`,
  Storage: `${api}/storage/v1/status`,
};

const NEEDED = 5;
const deadline = Date.now() + 120_000;
let streak = 0;
let last = "";
while (streak < NEEDED) {
  if (Date.now() > deadline) {
    console.error(`Supabase locale non pronto dopo 120 s (ultimo esito: ${last}).`);
    process.exit(1);
  }
  const results = await Promise.all(
    Object.entries(checks).map(async ([name, url]) => {
      try {
        const r = await fetch(url, { headers, signal: AbortSignal.timeout(5000) });
        return [name, r.status];
      } catch {
        return [name, "nessuna risposta"];
      }
    }),
  );
  last = results.map(([n, s]) => `${n} ${s}`).join(", ");
  streak = results.every(([, s]) => s === 200) ? streak + 1 : 0;
  await new Promise((r) => setTimeout(r, 500));
}
console.log(`Supabase locale pronto (${last}).`);
