/*
 * Voce fuori campo: una riga della tabella "Voce" di beats.md = un file in voce/.
 *
 *   node scripts/voce.mjs gen   [--provider say|elevenlabs|bip] [--voice …] [--only v01,v04b] [--force]
 *   node scripts/voce.mjs align [--only …] [--model small]
 *   node scripts/voce.mjs list
 *
 * Provider:
 *   say         voce di macOS (segnaposto gratuito, es. --voice Alice o Federica). Poi `align` per i tempi delle parole.
 *   elevenlabs  ELEVENLABS_API_KEY + ELEVENLABS_VOICE_ID (o --voice <id>); restituisce già i tempi delle parole.
 *               Modello: ELEVENLABS_MODEL (predefinito eleven_multilingual_v2).
 *   bip         toni sintetici, uno per parola, con tempi esatti: per provare la pipeline senza servizi.
 * Voce registrata: metti i file in voce/<riga>.wav (o .mp3/.m4a/.aiff), poi `align`.
 *
 * Scrive voce/voce.json: { lines: { <riga>: { file, text, provider, duration, words: [{ w, start, end }] } } }
 * (tempi in secondi dall'inizio del file, a velocità originale).
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseVoiceSheet, scriptWords, voiceTimeline } from "../src/beats.js";
import { APP_DIR } from "./serve.mjs";

const VOCE_DIR = join(APP_DIR, "voce");
const VOCE_JSON = join(VOCE_DIR, "voce.json");
const args = process.argv.slice(2);
const cmd = args[0];
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : fallback;
};
const flag = (name) => args.includes(`--${name}`);

const md = readFileSync(join(APP_DIR, "beats.md"), "utf8");
const music = JSON.parse(readFileSync(join(APP_DIR, "music.json"), "utf8"));
const sheet = parseVoiceSheet(md);
const only = opt("only")
  ?.split(",")
  .map((s) => s.trim());
const selected = sheet.filter((l) => !only || only.includes(l.id));
mkdirSync(VOCE_DIR, { recursive: true });
const voce = existsSync(VOCE_JSON) ? JSON.parse(readFileSync(VOCE_JSON, "utf8")) : { lines: {} };
const save = () => writeFileSync(VOCE_JSON, JSON.stringify(voce, null, 2) + "\n");

const run = (bin, a, input) => {
  const r = spawnSync(bin, a, { input, encoding: input ? undefined : "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (r.error) throw new Error(`${bin}: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`${bin} ${a.slice(0, 3).join(" ")}…: ${String(r.stderr).slice(-600)}`);
  return r.stdout;
};
const duration = (file) =>
  Number(run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).trim());
/** Qualsiasi formato → WAV 48 kHz mono 16 bit. */
const toWav = (src, dst) => run("ffmpeg", ["-y", "-loglevel", "error", "-i", src, "-ac", "1", "-ar", "48000", dst]);
const existing = (id) =>
  readdirSync(VOCE_DIR).find((f) => f.startsWith(`${id}.`) && /\.(wav|mp3|m4a|aiff?|flac)$/i.test(f));

/** Parole dai tempi dei caratteri (ElevenLabs). */
function wordsFromChars({ characters, character_start_times_seconds: s, character_end_times_seconds: e }) {
  const words = [];
  let cur = null;
  characters.forEach((ch, i) => {
    if (/\s/.test(ch)) {
      if (cur) words.push(cur);
      cur = null;
    } else if (!cur) cur = { w: ch, start: s[i], end: e[i] };
    else {
      cur.w += ch;
      cur.end = e[i];
    }
  });
  if (cur) words.push(cur);
  return words.filter((w) => /[\p{L}\p{N}]/u.test(w.w));
}

async function genElevenLabs(line, i) {
  const key = process.env.ELEVENLABS_API_KEY;
  const voiceId = opt("voice", process.env.ELEVENLABS_VOICE_ID);
  if (!key || !voiceId) throw new Error("Servono ELEVENLABS_API_KEY ed ELEVENLABS_VOICE_ID (o --voice <id>)");
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: { "xi-api-key": key, "content-type": "application/json" },
      body: JSON.stringify({
        text: line.text,
        model_id: process.env.ELEVENLABS_MODEL ?? "eleven_multilingual_v2",
        language_code: "it",
        // le frasi vicine danno continuità all'intonazione anche se i file sono separati
        previous_text: sheet[i - 1]?.text,
        next_text: sheet[i + 1]?.text,
        voice_settings: { stability: 0.35, similarity_boost: 0.8, style: 0.45, use_speaker_boost: true },
      }),
    },
  );
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 400)}`);
  const data = await res.json();
  const tmp = join(VOCE_DIR, `${line.id}.tmp.mp3`);
  writeFileSync(tmp, Buffer.from(data.audio_base64, "base64"));
  const file = `${line.id}.wav`;
  toWav(tmp, join(VOCE_DIR, file));
  rmSync(tmp);
  return { file, words: data.alignment ? wordsFromChars(data.alignment) : [] };
}

function genSay(line) {
  const tmp = join(VOCE_DIR, `${line.id}.tmp.aiff`);
  run("say", ["-v", opt("voice", "Alice"), "-r", opt("rate", "205"), "-o", tmp, line.text]);
  const file = `${line.id}.wav`;
  toWav(tmp, join(VOCE_DIR, file));
  rmSync(tmp);
  return { file, words: [] };
}

/** Toni sintetici: una nota per parola, durata proporzionale alle lettere, tempi esatti. */
function genBip(line, i) {
  const words = [];
  const parts = ["anullsrc=r=48000:cl=mono:d=0.06"];
  let t = 0.06;
  line.text
    .split(/\s+/)
    .filter((w) => /[\p{L}\p{N}]/u.test(w))
    .forEach((w, k) => {
      const d = Math.min(0.42, 0.06 + 0.045 * w.replace(/[^\p{L}]/gu, "").length);
      words.push({ w, start: +t.toFixed(3), end: +(t + d).toFixed(3) });
      parts.push(
        `sine=f=${330 + ((i * 3 + k) % 6) * 55}:d=${d.toFixed(3)},volume=0.4,afade=t=out:st=${(d - 0.03).toFixed(3)}:d=0.03`,
      );
      parts.push(`anullsrc=r=48000:cl=mono:d=${w.match(/[.,?!…:]$/) ? 0.16 : 0.05}`);
      t += d + (w.match(/[.,?!…:]$/) ? 0.16 : 0.05);
    });
  const file = `${line.id}.wav`;
  const inputs = parts.map((p, k) => `${p}[s${k}]`).join(";");
  const concat = parts.map((_, k) => `[s${k}]`).join("") + `concat=n=${parts.length}:v=0:a=1,aresample=48000[out]`;
  run("ffmpeg", [
    "-y",
    "-loglevel",
    "error",
    "-filter_complex",
    `${inputs};${concat}`,
    "-map",
    "[out]",
    "-ac",
    "1",
    join(VOCE_DIR, file),
  ]);
  return { file, words };
}

async function gen() {
  const provider = opt("provider", process.platform === "darwin" ? "say" : "bip");
  for (const line of selected) {
    const i = sheet.indexOf(line);
    const have = existing(line.id);
    const same = voce.lines[line.id]?.text === line.text;
    if (have && same && !flag("force")) {
      console.log(`${line.id}: già presente (${have}), salto (--force per rigenerare)`);
      continue;
    }
    if (have && voce.lines[line.id]?.provider === "registrata" && !flag("force")) {
      console.log(`${line.id}: registrazione presente ma il testo è cambiato: ri-registra o usa --force`);
      continue;
    }
    const out =
      provider === "elevenlabs" ? await genElevenLabs(line, i) : provider === "say" ? genSay(line) : genBip(line, i);
    voce.lines[line.id] = {
      ...out,
      text: line.text,
      provider,
      duration: +duration(join(VOCE_DIR, out.file)).toFixed(3),
    };
    save();
    console.log(`${line.id}: ${provider} → voce/${out.file} (${voce.lines[line.id].duration} s)  "${line.text}"`);
  }
  const missing = selected.filter((l) => !voce.lines[l.id]?.words?.length);
  if (missing.length && provider !== "bip")
    console.log(`\nSenza tempi delle parole: ${missing.map((l) => l.id).join(", ")} → node scripts/voce.mjs align`);
}

function align() {
  // file registrati a mano (voce/<riga>.wav) che non sono ancora in voce.json
  for (const line of selected) {
    const have = existing(line.id);
    if (have && !voce.lines[line.id]) {
      const file = have.endsWith(".wav") ? have : `${line.id}.wav`;
      if (file !== have) toWav(join(VOCE_DIR, have), join(VOCE_DIR, file));
      voce.lines[line.id] = { file, text: line.text, provider: "registrata", duration: 0, words: [] };
    }
  }
  const todo = selected.filter((l) => voce.lines[l.id] && (flag("force") || !voce.lines[l.id].words?.length));
  if (!todo.length) return console.log("Niente da allineare (--force per rifare anche quelle già allineate)");
  const files = todo.map((l) => join(VOCE_DIR, voce.lines[l.id].file));
  console.log(
    `Allineo ${todo.length} righe con Whisper (${opt("model", "small")}, la prima volta scarica il modello)…`,
  );
  const res = spawnSync(
    "python3",
    [
      join(APP_DIR, "scripts/voce_align.py"),
      "--model",
      opt("model", "small"),
      ...todo.flatMap((l, k) => ["--prompt", l.text, files[k]]),
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"], maxBuffer: 64 * 1024 * 1024 },
  );
  if (res.status !== 0) process.exit(res.status ?? 1);
  const out = JSON.parse(res.stdout);
  todo.forEach((l, k) => {
    let words = out[files[k]] ?? [];
    const expected = l.text.split(/\s+/).filter((w) => scriptWords(w).length);
    // stessa quantità di parole del copione: tieni i tempi di Whisper e il testo del copione (es. "Loyalty", "Wallet")
    if (words.length === expected.length) words = words.map((w, i) => ({ ...w, w: expected[i] }));
    else
      console.log(
        `${l.id}: Whisper ha sentito ${words.length} parole invece di ${expected.length}: controlla gli agganci`,
      );
    voce.lines[l.id] = { ...voce.lines[l.id], words, duration: +duration(files[k]).toFixed(3) };
    console.log(`${l.id}: ${words.map((w) => `${w.w}@${w.start.toFixed(2)}`).join(" ")}`);
  });
  save();
}

function list() {
  const { lines, warnings } = voiceTimeline(md, music, voce);
  for (const l of lines) {
    if (l.missing) console.log(`${l.id.padEnd(5)}  —      manca l'audio        "${l.text}"`);
    else
      console.log(
        `${l.id.padEnd(5)}  ${l.start.toFixed(2).padStart(6)} s → ${l.end.toFixed(2).padStart(6)} s  ×${l.factor.toFixed(2)}  ` +
          `${l.words.length ? "parole ok" : "senza parole"}  "${l.text}"` +
          (voce.lines[l.id]?.text !== l.text ? "  ⚠ testo cambiato: rigenera" : ""),
      );
  }
  if (warnings.length) console.log(`\n${warnings.join("\n")}`);
}

if (cmd === "gen") await gen();
else if (cmd === "align") align();
else if (cmd === "list") list();
else {
  console.log("Uso: node scripts/voce.mjs gen|align|list  (dettagli in testa al file)");
  process.exit(1);
}
if (cmd !== "list" && sheet.length) {
  console.log("");
  list();
}
