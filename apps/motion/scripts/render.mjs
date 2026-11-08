/*
 * Render deterministico: per ogni fotogramma porta la pagina al tempo esatto (window.__seek) e fa uno screenshot,
 * che va in ffmpeg via pipe. Nessun orologio reale: il risultato è identico a ogni render.
 *
 *   node scripts/render.mjs                         tutto il video → out/loyalty-wallet-promo.mp4 (+ musica e voce se ci sono)
 *   node scripts/render.mjs --scene 04-timbri       solo una scena → out/04-timbri.mp4
 *   node scripts/render.mjs --from 8 --to 12        un intervallo in secondi
 *   node scripts/render.mjs --sheet [--scene id]    contact sheet (16 fotogrammi in griglia) → out/sheet-*.jpg
 *   node scripts/render.mjs --still 17.5            un fotogramma → out/still-17.5.png
 * Opzioni: --fps 60 (default), --out file.mp4, --tiles 16, --no-audio, --no-music, --no-voice
 */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "@playwright/test";
import { audioGraph, loadAudioProject } from "./audio.mjs";
import { APP_DIR, startServer } from "./serve.mjs";

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : fallback;
};

const FPS = Number(opt("fps", 60));
const OUT_DIR = join(APP_DIR, "out");
mkdirSync(OUT_DIR, { recursive: true });

const { server, port } = await startServer(0);
// CHROME_PATH: Chromium già installato altrove (es. CI) invece di quello di Playwright
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
await page.goto(`http://127.0.0.1:${port}/?render=1`, { waitUntil: "commit" });
try {
  await page.waitForFunction(() => window.__ready === true, null, { polling: 100, timeout: 30_000 });
} catch {
  console.error(`La pagina non è pronta. Errori:\n${errors.join("\n") || "(nessuno)"}`);
  process.exit(1);
}
const duration = await page.evaluate(() => window.__duration);
const scenes = await page.evaluate(() => window.__scenes);

let from = Number(opt("from", 0));
let to = Number(opt("to", duration));
const sceneId = opt("scene");
if (sceneId) {
  const s = scenes.find((x) => x.id === sceneId);
  if (!s) throw new Error(`Scena "${sceneId}" non trovata. Scene: ${scenes.map((x) => x.id).join(", ")}`);
  [from, to] = [s.start, s.end];
}
to = Math.min(to, duration);
const tag = sceneId ?? (from === 0 && to === duration ? "full" : `${from}-${to}`);
const shot = async (t) => {
  await page.evaluate((x) => window.__seek(x), t);
  return page.screenshot({ type: "png" });
};
const run = (cmd, cmdArgs, input) =>
  new Promise((ok, ko) => {
    const p = spawn(cmd, cmdArgs, { stdio: [input ? "pipe" : "ignore", "ignore", "inherit"] });
    p.on("error", ko);
    p.on("close", (code) => (code === 0 ? ok() : ko(new Error(`${cmd} è uscito con codice ${code}`))));
    if (input) input(p.stdin);
  });

if (opt("still") !== undefined || flag("still")) {
  const t = Number(opt("still", from));
  const file = join(OUT_DIR, `still-${t}.png`);
  writeFileSync(file, await shot(t));
  console.log(file);
} else if (flag("sheet")) {
  // contact sheet: per farsi un'idea della scena senza guardare il video (Claude legge l'immagine)
  const tiles = Number(opt("tiles", 16));
  const cols = Math.ceil(Math.sqrt(tiles));
  const rows = Math.ceil(tiles / cols);
  const file = join(OUT_DIR, `sheet-${tag}.jpg`);
  const times = Array.from({ length: tiles }, (_, i) => from + ((to - from) * i) / tiles);
  await run(
    "ffmpeg",
    [
      "-y",
      "-loglevel",
      "error",
      "-f",
      "image2pipe",
      "-framerate",
      "1",
      "-i",
      "-",
      "-vf",
      `scale=480:-1,tile=${cols}x${rows}`,
      "-frames:v",
      "1",
      "-q:v",
      "3",
      file,
    ],
    async (stdin) => {
      for (const t of times) stdin.write(await shot(t));
      stdin.end();
    },
  );
  console.log(`${file}\nriquadri (da sinistra a destra, dall'alto) a: ${times.map((t) => t.toFixed(2)).join(" ")} s`);
} else {
  const file = opt("out")
    ? resolve(opt("out"))
    : join(OUT_DIR, tag === "full" ? "loyalty-wallet-promo.mp4" : `${tag}.mp4`);
  // audio: musica + voce con ducking (scripts/audio.mjs); --no-audio, --no-music, --no-voice per escluderli
  const project = loadAudioProject();
  for (const w of project.warnings) console.warn(w);
  const graph = flag("no-audio")
    ? null
    : audioGraph(project, { from, to, firstInput: 1, music: !flag("no-music"), voice: !flag("no-voice") });
  const audioArgs = graph
    ? [...graph.inputs, "-filter_complex", graph.filter, "-map", "0:v", "-map", "[aout]", "-c:a", "aac", "-b:a", "320k"]
    : [];
  const total = Math.round((to - from) * FPS);
  const started = Date.now();
  await run(
    "ffmpeg",
    [
      "-y",
      "-loglevel",
      "error",
      "-f",
      "image2pipe",
      "-framerate",
      String(FPS),
      "-i",
      "-",
      ...audioArgs,
      "-c:v",
      "libx264",
      "-preset",
      "medium",
      "-crf",
      "14",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      file,
    ],
    async (stdin) => {
      for (let f = 0; f < total; f++) {
        const buf = await shot(from + f / FPS);
        if (!stdin.write(buf)) await new Promise((r) => stdin.once("drain", r));
        if (f % FPS === 0) process.stdout.write(`\r${f}/${total} fotogrammi`);
      }
      stdin.end();
    },
  );
  console.log(`\r${total}/${total} fotogrammi in ${((Date.now() - started) / 1000).toFixed(1)} s → ${file}`);
}

if (errors.length) console.warn(`Errori nella pagina:\n${errors.join("\n")}`);
await browser.close();
server.close();
