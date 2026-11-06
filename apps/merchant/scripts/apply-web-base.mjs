#!/usr/bin/env node
// Dopo `expo export --platform web`: i file di public/ (index.html, manifest) usano percorsi dalla
// radice, comodi in sviluppo. Qui li si porta sotto il prefisso della web app (EXPO_WEB_BASE_URL,
// es. /app), lo stesso passato a experiments.baseUrl: l'app è servita dal server del sito.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const dist = resolve(dirname(fileURLToPath(import.meta.url)), "..", process.argv[2] ?? "dist");
const base = (process.env.EXPO_WEB_BASE_URL ?? "").replace(/\/+$/, "");
if (!base) {
  console.log("ℹ EXPO_WEB_BASE_URL vuota: web app servita alla radice, percorsi invariati.");
  process.exit(0);
}
if (!/^\/[a-z0-9-]+(\/[a-z0-9-]+)*$/.test(base)) {
  console.error(`✖ EXPO_WEB_BASE_URL non valida: "${base}" (atteso un percorso come /app)`);
  process.exit(1);
}

const htmlPath = join(dist, "index.html");
let html = readFileSync(htmlPath, "utf8");
const before = html;
html = html
  .replace('href="/manifest.webmanifest"', `href="${base}/manifest.webmanifest"`)
  .replaceAll('href="/icons/', `href="${base}/icons/`)
  .replace('register("/sw.js")', `register("${base}/sw.js", { scope: "${base}" })`);
if (html === before || html.includes('register("/sw.js")')) {
  console.error("✖ index.html: percorsi del manifest o del service worker non trovati, controllare public/index.html");
  process.exit(1);
}
writeFileSync(htmlPath, html);

const manifestPath = join(dist, "manifest.webmanifest");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
// senza "/" finale: Next reindirizza "/app/" su "/app" (il SW ha scope "/app", vedi Service-Worker-Allowed)
manifest.id = base;
manifest.start_url = base;
manifest.scope = base;
manifest.icons = manifest.icons.map((i) => ({ ...i, src: `${base}${i.src}` }));
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`✔ web app esercente preparata per il prefisso ${base} (index.html, manifest)`);
