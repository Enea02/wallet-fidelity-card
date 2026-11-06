#!/usr/bin/env node
// Build della web app esercente servita dal server del sito sotto /app (stesso dominio del web
// pubblico e del pannello interno): export Expo con experiments.baseUrl, poi i percorsi di
// index.html e del manifest portati sotto il prefisso. `--source-maps` per il caricamento su Sentry.
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = process.env.MERCHANT_WEB_OUT ?? "dist";
const env = { ...process.env, EXPO_WEB_BASE_URL: process.env.EXPO_WEB_BASE_URL ?? "/app" };

function run(cmd, args) {
  const r = spawnSync(cmd, args, { cwd: here, env, stdio: "inherit" });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

run("node", ["scripts/copy-zxing.mjs"]);
run("expo", ["export", "--platform", "web", "--output-dir", outDir, ...process.argv.slice(2)]);
run("node", ["scripts/apply-web-base.mjs", outDir]);
