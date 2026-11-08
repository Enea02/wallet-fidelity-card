/*
 * Video di riferimento → contact sheet da far leggere a Claude (che non guarda i video, ma legge le immagini).
 *   node scripts/refs.mjs refs/esempio.mp4 [--fps 4] [--from 0 --to 12]
 * Scrive refs/<nome>-sheet.jpg (un fotogramma ogni 1/fps secondi, griglia da 6 colonne) e stampa la durata dei tagli
 * rilevati (cambi di scena netti), utile per descrivere il ritmo nella beat sheet.
 */
import { spawnSync } from "node:child_process";
import { basename, extname, join, resolve } from "node:path";
import { APP_DIR } from "./serve.mjs";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
if (!file) {
  console.error("Uso: node scripts/refs.mjs refs/video.mp4 [--fps 4] [--from 0 --to 12]");
  process.exit(1);
}
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const input = resolve(file);
const fps = Number(opt("fps", 4));
const range = [...(opt("from") ? ["-ss", opt("from")] : []), ...(opt("to") ? ["-to", opt("to")] : [])];
const out = join(APP_DIR, "refs", `${basename(input, extname(input))}-sheet.jpg`);

const probe = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", input], {
  encoding: "utf8",
});
const seconds = (Number(opt("to", probe.stdout)) || 0) - Number(opt("from", 0));
const rows = Math.max(1, Math.ceil((seconds * fps) / 6));

spawnSync(
  "ffmpeg",
  [
    "-y",
    "-loglevel",
    "error",
    ...range,
    "-i",
    input,
    "-vf",
    `fps=${fps},scale=400:-1,tile=6x${rows}`,
    "-frames:v",
    "1",
    "-q:v",
    "3",
    out,
  ],
  { stdio: "inherit" },
);
console.log(`${out}  (${(seconds * fps).toFixed(0)} riquadri, uno ogni ${(1 / fps).toFixed(2)} s, 6 per riga)`);

// tagli netti: filtro scene di ffmpeg
const cuts = spawnSync(
  "ffmpeg",
  ["-hide_banner", ...range, "-i", input, "-vf", "select='gt(scene,0.35)',showinfo", "-f", "null", "-"],
  { encoding: "utf8" },
);
const times = [...cuts.stderr.matchAll(/pts_time:([\d.]+)/g)].map((m) => Number(m[1]));
if (times.length) {
  const gaps = times.map((t, i) => t - (i ? times[i - 1] : 0));
  const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  console.log(`${times.length} tagli, durata media di un'inquadratura ${avg.toFixed(2)} s`);
  console.log(`tagli a: ${times.map((t) => t.toFixed(2)).join(" ")} s`);
}
