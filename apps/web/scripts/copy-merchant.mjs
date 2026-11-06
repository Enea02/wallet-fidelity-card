#!/usr/bin/env node
// La web app esercente (export statico di apps/merchant) è servita da questo server sotto /app:
// stesso dominio, build e deploy del web pubblico e del pannello interno. Qui la si copia in
// public/app/ prima di `next build` (o di `next start` nei test end-to-end, con un export diverso).
// Uso: node scripts/copy-merchant.mjs [cartella dell'export, default ../merchant/dist]
import { cpSync, existsSync, readFileSync, rmSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const web = join(dirname(fileURLToPath(import.meta.url)), "..");
const from = resolve(web, process.argv[2] ?? "../merchant/dist");
const to = join(web, "public", "app");

const index = join(from, "index.html");
if (!existsSync(index)) {
  console.error(
    `✖ Web app esercente non trovata in ${relative(web, from)}: esegui \`pnpm build\` dalla radice del monorepo ` +
      "(Turborepo compila prima apps/merchant) oppure `pnpm --filter @loyalty/merchant build`.",
  );
  process.exit(1);
}
if (!readFileSync(index, "utf8").includes('src="/app/_expo/')) {
  console.error(
    `✖ L'export in ${relative(web, from)} non è preparato per /app: va generato con scripts/build-web.mjs di apps/merchant.`,
  );
  process.exit(1);
}

rmSync(to, { recursive: true, force: true });
cpSync(from, to, { recursive: true });
console.log(`✔ Web app esercente copiata da ${relative(web, from)} in public/app/ (servita su /app)`);
