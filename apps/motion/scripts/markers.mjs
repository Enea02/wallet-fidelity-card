/*
 * Cue SFX della beat sheet (e inizio delle frasi della voce, marker color crema) → marker per il montaggio.
 *   out/markers.edl  da importare in DaVinci Resolve: tasto destro sulla timeline → Timelines → Import →
 *                    Timeline Markers from EDL… (i marker cadono sul fotogramma del cue, nome = suono)
 *   out/markers.csv  gli stessi cue in tabella (secondi, timecode, scena, suono), per qualsiasi editor
 * Opzioni: --fps 60 (deve essere quello della timeline), --start 01:00:00:00 (inizio della timeline in Resolve)
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { timeline } from "../src/beats.js";
import { APP_DIR } from "./serve.mjs";

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const FPS = Number(opt("fps", 60));
const START = opt("start", "01:00:00:00");

const md = readFileSync(join(APP_DIR, "beats.md"), "utf8");
const music = JSON.parse(readFileSync(join(APP_DIR, "music.json"), "utf8"));
const voceFile = join(APP_DIR, "voce/voce.json");
const voce = existsSync(voceFile) ? JSON.parse(readFileSync(voceFile, "utf8")) : null;
const { scenes, voice } = timeline(md, music, voce);

const startFrames = START.split(":")
  .map(Number)
  .reduce((acc, v, i) => acc + v * [3600 * FPS, 60 * FPS, FPS, 1][i], 0);
const tc = (frames) => {
  const f = frames % FPS;
  const s = Math.floor(frames / FPS);
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}:${pad(f)}`;
};

// cue SFX + inizio di ogni frase della voce (sulla prima parola), in ordine di tempo
const voiceCues = voice.lines
  .filter((l) => !l.missing)
  .map((l) => ({
    name: `voce ${l.id}: ${l.text}`,
    time: l.words[0]?.start ?? l.start,
    scene: "voce",
    beat: l.beat,
    voice: true,
  }));
const cues = scenes
  .flatMap((s) => s.sfxCues.map((c) => ({ ...c, scene: s.id })))
  .concat(voiceCues)
  .sort((a, b) => a.time - b.time);

const COLORS = ["Blue", "Cyan", "Green", "Yellow", "Red", "Pink", "Purple", "Fuchsia"];
const edl = [`TITLE: Loyalty Wallet promo - SFX`, `FCM: NON-DROP FRAME`, ``];
cues.forEach((c, i) => {
  const frame = startFrames + Math.round(c.time * FPS);
  const color = c.voice ? "Cream" : COLORS[scenes.findIndex((s) => s.id === c.scene) % COLORS.length];
  edl.push(
    `${String(i + 1).padStart(3, "0")}  001      V     C        ${tc(frame)} ${tc(frame + 1)} ${tc(frame)} ${tc(frame + 1)}  `,
    ` |C:ResolveColor${color} |M:${c.voice ? c.name.replace(/[|]/g, "/") : `${c.name} (${c.scene})`} |D:1`,
    ``,
  );
});

const csv = ["secondi,timecode,scena,suono,battuta_scena"].concat(
  cues.map(
    (c) =>
      `${c.time.toFixed(3)},${tc(startFrames + Math.round(c.time * FPS))},${c.scene},"${c.name.replace(/"/g, "'")}",${c.beat}`,
  ),
);

mkdirSync(join(APP_DIR, "out"), { recursive: true });
writeFileSync(join(APP_DIR, "out/markers.edl"), edl.join("\n"));
writeFileSync(join(APP_DIR, "out/markers.csv"), csv.join("\n") + "\n");
console.log(`${cues.length} cue → out/markers.edl, out/markers.csv (${FPS} fps, inizio ${START})`);
