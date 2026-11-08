#!/usr/bin/env node
// Build del vecchio progetto della web app esercente: una pagina che porta al nuovo indirizzo
// (NUOVO_URL_APP, es. https://carte.esempio.it/app) e un service worker che si disinstalla.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const target = (process.env.NUOVO_URL_APP ?? "").replace(/\/+$/, "");
if (!URL.canParse(target) || !target.startsWith("https://")) {
  console.error(
    "✖ NUOVO_URL_APP mancante o non valida: serve l'indirizzo https della web app, es. https://carte.esempio.it/app",
  );
  process.exit(1);
}
const out = join(here, "dist");
mkdirSync(out, { recursive: true });
const html = readFileSync(join(here, "index.html"), "utf8").replaceAll("__NUOVO_URL_APP__", target);
writeFileSync(join(out, "index.html"), html);
copyFileSync(join(here, "sw.js"), join(out, "sw.js"));
console.log(`✔ redirect verso ${target} pronto in dist/`);
