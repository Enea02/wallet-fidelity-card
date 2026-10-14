#!/usr/bin/env node
// Avvia Supabase in locale (se non è già attivo) e, al primo avvio, crea
// apps/web/.env.local con le chiavi del Supabase locale. Usato da `pnpm dev` e `pnpm db:start`.
import { execFileSync, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const envLocal = join(root, "apps/web/.env.local");
const envExample = join(root, "apps/web/.env.example");

function fail(message) {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

function status() {
  try {
    const out = execFileSync("supabase", ["status", "-o", "json"], { cwd: root, stdio: ["ignore", "pipe", "ignore"] });
    return JSON.parse(out.toString());
  } catch {
    return null;
  }
}

if (spawnSync("supabase", ["--version"], { stdio: "ignore" }).error) {
  fail("Supabase CLI non trovata. Installala con: brew install supabase/tap/supabase");
}

let s = status();
if (!s) {
  if (spawnSync("docker", ["info"], { stdio: "ignore" }).status !== 0) {
    fail("Docker non risponde. Avvia Docker Desktop e riprova.");
  }
  console.log("▶ Avvio Supabase locale (la prima volta scarica le immagini Docker, qualche minuto)…");
  const r = spawnSync("supabase", ["start"], { cwd: root, stdio: ["ignore", "ignore", "inherit"] });
  if (r.status !== 0) fail("supabase start non è riuscito: vedi l'errore sopra.");
  s = status();
  if (!s) fail("Supabase è partito ma `supabase status` non risponde.");
}
console.log(`✔ Supabase locale attivo: API ${s.API_URL} · Studio ${s.STUDIO_URL}`);

// variabili che si possono generare da sole: aggiunte anche a un .env.local già esistente
const generated = {
  ADMIN_SETUP_TOKEN: () => randomBytes(24).toString("hex"),
  IP_HASH_SALT: () => randomBytes(16).toString("hex"),
};

// variabili nuove con un valore fisso per lo sviluppo locale
const localDefaults = {
  MERCHANT_APP_ORIGINS: () => "http://localhost:8081",
  MERCHANT_APP_URL: () => "http://localhost:8081",
};

if (existsSync(envLocal)) {
  const current = readFileSync(envLocal, "utf8");
  const fillable = { ...generated, ...localDefaults };
  const missing = Object.keys(fillable).filter((k) => !new RegExp(`^${k}=.+`, "m").test(current));
  if (missing.length > 0) {
    const lines = missing.map((k) => `${k}=${fillable[k]()}`).join("\n");
    writeFileSync(envLocal, `${current.replace(/\n*$/, "\n")}${lines}\n`, { mode: 0o600 });
    console.log(`✔ Aggiunte ad apps/web/.env.local le variabili nuove: ${missing.join(", ")}.`);
  }
} else {
  const values = {
    APP_ENV: "development",
    APP_BASE_URL: "http://localhost:3000",
    NEXT_PUBLIC_SUPABASE_URL: s.API_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: s.ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: s.SERVICE_ROLE_KEY,
    ...Object.fromEntries(Object.entries({ ...generated, ...localDefaults }).map(([k, gen]) => [k, gen()])),
  };
  // parte da .env.example così commenti e voci facoltative restano documentati
  const content = readFileSync(envExample, "utf8")
    .split("\n")
    .map((line) => {
      const key = line.match(/^([A-Z0-9_]+)=/)?.[1];
      return key && key in values ? `${key}=${values[key]}` : line;
    })
    .join("\n");
  writeFileSync(envLocal, content, { mode: 0o600 });
  console.log("✔ Creato apps/web/.env.local con le chiavi del Supabase locale (Google Wallet disattivato).");
}
