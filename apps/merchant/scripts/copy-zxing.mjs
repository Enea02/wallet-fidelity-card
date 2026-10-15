#!/usr/bin/env node
// Copia il motore di lettura dei QR (ZXing in WebAssembly, usato dallo scanner web quando il
// browser non ha BarcodeDetector) in public/zxing/: lo serviamo noi invece del CDN di default
// (privacy, PWA offline, nessuna dipendenza da terzi). Gira prima di `dev` e `build`.
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = join(dirname(fileURLToPath(import.meta.url)), "..");
// zxing-wasm è una dipendenza di barcode-detector: si risolve a partire da lì
const fromDetector = createRequire(createRequire(join(here, "package.json")).resolve("barcode-detector/pure"));
const entry = fromDetector.resolve("zxing-wasm/reader");
const wasm = join(entry.slice(0, entry.lastIndexOf("/dist/")), "dist", "reader", "zxing_reader.wasm");
const out = join(here, "public", "zxing", "zxing_reader.wasm");
mkdirSync(dirname(out), { recursive: true });
copyFileSync(wasm, out);
console.log(`✔ motore QR per il web copiato in public/zxing/ (${wasm.split("node_modules/").pop()})`);
