/*
 * Audio del video: musica (dal punto del beat 0, dissolvenza finale) + voce (ogni riga sul suo tempo, accelerata se
 * serve) + ducking (la musica si abbassa quando parla la voce). Lo usa render.mjs; da solo esporta gli stem per il
 * montaggio:
 *
 *   node scripts/audio.mjs            → out/mix.wav, out/voce.wav, out/musica.wav (tutti lunghi quanto il video,
 *                                        da mettere a inizio timeline in DaVinci)
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { timeline } from "../src/beats.js";
import { APP_DIR } from "./serve.mjs";

/** Dati audio del progetto letti dal disco. */
export function loadAudioProject() {
  const md = readFileSync(join(APP_DIR, "beats.md"), "utf8");
  const music = JSON.parse(readFileSync(join(APP_DIR, "music.json"), "utf8"));
  const voceFile = join(APP_DIR, "voce/voce.json");
  const voce = existsSync(voceFile) ? JSON.parse(readFileSync(voceFile, "utf8")) : null;
  const t = timeline(md, music, voce);
  const musicFile = music.file ? join(APP_DIR, music.file) : null;
  return {
    duration: t.duration,
    musicStart: t.clock.musicStart,
    musicFile: musicFile && existsSync(musicFile) ? musicFile : null,
    voice: t.voice.lines.filter((l) => !l.missing && existsSync(join(APP_DIR, "voce", l.file))),
    warnings: t.voice.warnings,
  };
}

/** atempo accetta 0.5–2: per l'intervallo che usiamo (1–1.3) basta un filtro. */
const tempo = (f) => (Math.abs(f - 1) < 1e-3 ? "" : `atempo=${f.toFixed(4)},`);

/**
 * Argomenti ffmpeg (input + filter_complex) per l'audio fra `from` e `to` (secondi del video).
 * `firstInput` = indice del primo input audio (1 se l'input 0 è il video in pipe).
 * Restituisce null se non c'è niente da mixare. Uscite: [aout] (mix), più [vox] e [mus] se `stems`.
 */
export function audioGraph(
  project,
  { from = 0, to = project.duration, firstInput = 1, music = true, voice = true, stems = false } = {},
) {
  const len = to - from;
  const inputs = [];
  const chains = [];
  let idx = firstInput;
  const STEREO = "aformat=sample_rates=48000:channel_layouts=stereo";

  let mus = null;
  if (music && project.musicFile) {
    inputs.push("-ss", String(project.musicStart + from), "-i", project.musicFile);
    const fadeStart = Math.max(0, project.duration - 1.5 - from);
    chains.push(
      `[${idx++}:a]${STEREO},atrim=0:${len.toFixed(3)},asetpts=PTS-STARTPTS,volume=0.85,afade=t=out:st=${fadeStart.toFixed(3)}:d=1.5[m0]`,
    );
    mus = "m0";
  }

  const voiceLabels = [];
  if (voice) {
    for (const l of project.voice) {
      if (l.end <= from || l.start >= to) continue;
      inputs.push("-i", join(APP_DIR, "voce", l.file));
      const label = `v${voiceLabels.length}`;
      const delay = l.start - from;
      // inizio prima di `from`: si taglia la testa (dopo l'accelerazione, quindi in secondi del video)
      const head = delay < 0 ? `atrim=start=${(-delay).toFixed(3)},asetpts=PTS-STARTPTS,` : "";
      const pad = delay > 0 ? `adelay=${Math.round(delay * 1000)}:all=1,` : "";
      chains.push(`[${idx++}:a]${STEREO},${tempo(l.factor)}${head}${pad}volume=1.0[${label}]`);
      voiceLabels.push(label);
    }
  }
  if (!mus && !voiceLabels.length) return null;

  // durata esatta del tratto di video (sempre per ultimo: il limiter con compensazione accorcia la coda)
  const fit = `apad,atrim=0:${len.toFixed(3)},asetpts=PTS-STARTPTS`;
  let vox = null;
  if (voiceLabels.length) {
    chains.push(`${voiceLabels.map((l) => `[${l}]`).join("")}amix=inputs=${voiceLabels.length}:normalize=0,${fit}[vx]`);
    vox = "vx";
  }
  const outs = [];
  if (mus && vox) {
    const n = stems ? 3 : 2;
    chains.push(`[${vox}]asplit=${n}[vsc][vmix]${stems ? "[vox]" : ""}`);
    if (stems) chains.push(`[${mus}]asplit=2[mduckin][mus]`);
    // ducking: compressore sulla musica comandato dalla voce (circa −8/−10 dB mentre parla; più forte: abbassa threshold)
    chains.push(
      `[${stems ? "mduckin" : mus}][vsc]sidechaincompress=threshold=0.008:ratio=10:attack=10:release=300:makeup=1[mduck]`,
      `[mduck][vmix]amix=inputs=2:normalize=0,alimiter=limit=0.95:latency=1,${fit}[aout]`,
    );
  } else if (vox) {
    chains.push(`[${vox}]${stems ? "asplit=2[aout][vox]" : `alimiter=limit=0.95:latency=1,${fit}[aout]`}`);
  } else {
    chains.push(`[${mus}]${fit}${stems ? ",asplit=2[aout][mus]" : "[aout]"}`);
  }
  outs.push("aout");
  if (stems && vox) outs.push("vox");
  if (stems && mus) outs.push("mus");
  return { inputs, filter: chains.join(";"), outs };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const project = loadAudioProject();
  for (const w of project.warnings) console.warn(w);
  const g = audioGraph(project, { firstInput: 0, stems: true });
  if (!g) {
    console.log("Niente audio: manca sia la musica (music.json) sia la voce (voce/voce.json)");
    process.exit(0);
  }
  const outDir = join(APP_DIR, "out");
  mkdirSync(outDir, { recursive: true });
  const names = { aout: "mix.wav", vox: "voce.wav", mus: "musica.wav" };
  const maps = g.outs.flatMap((o) => ["-map", `[${o}]`, "-c:a", "pcm_s24le", join(outDir, names[o])]);
  const r = spawnSync("ffmpeg", ["-y", "-loglevel", "error", ...g.inputs, "-filter_complex", g.filter, ...maps], {
    stdio: "inherit",
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
  console.log(
    `${g.outs.map((o) => `out/${names[o]}`).join(", ")} — ${project.duration.toFixed(2)} s, 48 kHz 24 bit` +
      (g.outs.includes("mus") ? " (musica.wav senza ducking, con dissolvenza finale)" : ""),
  );
}
