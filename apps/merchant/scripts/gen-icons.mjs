#!/usr/bin/env node
// Genera le icone dell'app (iOS, Android, web/PWA) da un SVG: il timbro pieno del design system
// (disco con anello interno e spunta ruotata) in crema su inchiostro. Usa il Chromium di Playwright.
// Uso: node apps/merchant/scripts/gen-icons.mjs
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const here = join(dirname(fileURLToPath(import.meta.url)), "..");
const INK = "#2A211C";
const CREAM = "#FBF8F3";
const CHECK = '<path d="m5 12.5 4.5 4.5L19 7.5"/>';

/** scale = diametro del timbro rispetto al lato; bg = null per sfondo trasparente. */
function svg({ scale, bg, disc = CREAM, mark = INK }) {
  const r = 50 * scale;
  const s = (r * 1.15) / 12;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100%" height="100%">
    ${bg ? `<rect width="100" height="100" fill="${bg}"/>` : ""}
    <circle cx="50" cy="50" r="${r}" fill="${disc}"/>
    <circle cx="50" cy="50" r="${r * 0.8}" fill="none" stroke="${mark}" stroke-opacity=".35" stroke-width="${r * 0.04}"/>
    <g transform="translate(${50 - 12 * s} ${50 - 12 * s}) scale(${s}) rotate(-12 12 12)" fill="none" stroke="${mark}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${CHECK}</g>
  </svg>`;
}

const icons = [
  // iOS: quadrato pieno, il sistema arrotonda gli angoli
  { file: "assets/icon.png", size: 1024, svg: svg({ scale: 0.62, bg: INK }) },
  // Android adaptive: solo il timbro, dentro la zona sicura (66%); lo sfondo è in app.config.ts
  { file: "assets/adaptive-icon.png", size: 1024, svg: svg({ scale: 0.4, bg: null }) },
  { file: "assets/splash-icon.png", size: 512, svg: svg({ scale: 0.96, bg: null, disc: INK, mark: CREAM }) },
  { file: "assets/favicon.png", size: 48, svg: svg({ scale: 0.9, bg: null, disc: INK, mark: CREAM }) },
  { file: "public/icons/icon-192.png", size: 192, svg: svg({ scale: 0.62, bg: INK }) },
  { file: "public/icons/icon-512.png", size: 512, svg: svg({ scale: 0.62, bg: INK }) },
  // maskable: il browser può ritagliare fino al 20% per lato
  { file: "public/icons/maskable-512.png", size: 512, svg: svg({ scale: 0.5, bg: INK }) },
  { file: "public/icons/apple-touch-icon.png", size: 180, svg: svg({ scale: 0.62, bg: INK }) },
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const icon of icons) {
  await page.setViewportSize({ width: icon.size, height: icon.size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${icon.svg}</body></html>`);
  const out = join(here, icon.file);
  mkdirSync(dirname(out), { recursive: true });
  await page.screenshot({ path: out, omitBackground: true });
  console.log(`✔ ${icon.file} (${icon.size}×${icon.size})`);
}
await browser.close();
