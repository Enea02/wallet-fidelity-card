#!/usr/bin/env node
// Esegue la raccolta Bruno (bruno/) contro il server locale, passando la chiave anon
// del Supabase locale letta da apps/web/.env.local (nessuna chiave nel repository).
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const envFile = join(root, "apps/web/.env.local");
if (!existsSync(envFile)) {
  console.error("✖ apps/web/.env.local non trovato: eseguire prima `pnpm dev`.");
  process.exit(1);
}
const anonKey = readFileSync(envFile, "utf8")
  .match(/^NEXT_PUBLIC_SUPABASE_ANON_KEY=(.+)$/m)?.[1]
  ?.trim();
if (!anonKey) {
  console.error("✖ NEXT_PUBLIC_SUPABASE_ANON_KEY mancante in apps/web/.env.local.");
  process.exit(1);
}
const r = spawnSync("bru", ["run", "--env", "local", "--env-var", `anonKey=${anonKey}`, ...process.argv.slice(2)], {
  cwd: join(root, "bruno"),
  stdio: "inherit",
  shell: process.platform === "win32",
});
process.exit(r.status ?? 1);
