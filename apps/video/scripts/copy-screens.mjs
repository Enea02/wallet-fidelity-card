#!/usr/bin/env node
// Copia le schermate reali del tutorial (docs/tutorial/img, generate da
// apps/merchant/scripts/tutorial-screenshots.mjs) in public/screens, da dove Remotion le legge con staticFile().
import { cpSync, existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const from = join(here, "../../../docs/tutorial/img");
const to = join(here, "../public/screens");

if (!existsSync(from) || readdirSync(from).length === 0) {
  console.error(
    "✖ Mancano le schermate in docs/tutorial/img: generale con apps/merchant/scripts/tutorial-screenshots.mjs.",
  );
  process.exit(1);
}
cpSync(from, to, { recursive: true });
console.log(`✔ ${readdirSync(to).length} schermate copiate in public/screens`);
