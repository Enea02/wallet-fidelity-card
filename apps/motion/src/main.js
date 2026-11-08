/*
 * Motore: legge beats.md + music.json, costruisce una timeline GSAP in pausa (una sotto-timeline per scena)
 * ed espone al render:
 *   window.__seek(t)   porta il video al secondo t (deterministico: nessun orologio, nessun requestAnimationFrame)
 *   window.__duration  durata in secondi
 *   window.__scenes    scene con start/end in secondi
 *   window.__voice     righe della voce con tempi e avvisi (per il render e per controllare)
 *   window.__ready     true quando font e immagini sono caricati
 * Senza ?render=1 mostra l'anteprima con barra di scorrimento, scene e audio sincronizzato.
 */
import { normWord, timeline } from "./beats.js";
import { scenes as builders } from "./scenes/index.js";

const gsap = window.gsap;
const params = new URLSearchParams(location.search);
const RENDER = params.has("render");
if (RENDER) document.body.classList.add("render");

const [md, music, voce] = await Promise.all([
  fetch("/beats.md").then((r) => r.text()),
  fetch("/music.json").then((r) => r.json()),
  fetch("/voce/voce.json").then((r) => (r.ok ? r.json() : null)),
]);
const { scenes, clock, voice, duration } = timeline(md, music, voce);
for (const w of voice.warnings) console.warn(w);
/** Tutte le parole della voce, in ordine, con i tempi nel video. */
const spoken = voice.lines
  .filter((l) => !l.missing)
  .flatMap((l) => l.words.map((w) => ({ ...w, n: normWord(w.w) })))
  .sort((x, y) => x.start - y.start);

const stage = document.getElementById("stage");
const master = gsap.timeline({ paused: true });
const sceneEls = [];

for (const row of scenes) {
  const build = builders[row.id];
  if (!build) throw new Error(`Nessuna scena "${row.id}" in src/scenes/index.js`);
  const el = document.createElement("section");
  el.className = "scene";
  el.dataset.scene = row.id;
  stage.append(el);
  const tl = gsap.timeline();
  /** secondi dall'inizio della scena alla battuta n (relativa alla scena) */
  const b = (n) => clock.at(row.from + n) - row.start;
  /**
   * secondi dall'inizio della scena a quando la voce dice `parola` (prima occorrenza nella scena, o la n-esima);
   * se la voce non c'è o non la dice, la battuta di riserva `fallback`
   */
  const w = (parola, fallback, n = 1) => {
    const key = normWord(parola);
    const hits = spoken.filter((x) => x.n.startsWith(key) && x.start >= row.start - 0.5 && x.start < row.end);
    return hits[n - 1] ? hits[n - 1].start - row.start : b(fallback);
  };
  build({ el, tl, b, w, dur: row.end - row.start, beat: clock.period, row });
  master.add(tl, row.start);
  sceneEls.push({ el, start: row.start, end: row.end });
}
// la timeline dura quanto la beat sheet, anche se l'ultima scena ha animazioni più corte
master.set({}, {}, duration);

await document.fonts.ready;
await Promise.all(["400", "700", "800"].map((w) => document.fonts.load(`${w} 100px "Bricolage Grotesque Variable"`)));
await Promise.all([...document.images].map((img) => img.decode().catch(() => {})));

window.__seek = (t) => {
  const x = Math.max(0, Math.min(duration - 1e-6, t));
  // la scena visibile si calcola qui e non con set nella timeline: un set a tempo esatto è ambiguo per GSAP
  for (const s of sceneEls) s.el.style.visibility = x >= s.start && x < s.end ? "visible" : "hidden";
  master.seek(x, false);
  // niente valore di ritorno: Playwright proverebbe a serializzare l'intera timeline
};
window.__duration = duration;
window.__scenes = scenes.map(({ id, start, end, from, to }) => ({ id, start, end, from, to }));
window.__voice = voice;
window.__seek(Number(params.get("t") ?? 0));
window.__ready = true;

if (!RENDER) preview();

function preview() {
  const viewport = document.getElementById("viewport");
  const fit = () => {
    const s = Math.min(viewport.clientWidth / 1920, viewport.clientHeight / 1080);
    const x = (viewport.clientWidth - 1920 * s) / 2;
    const y = (viewport.clientHeight - 1080 * s) / 2;
    stage.style.transform = `translate(${x}px, ${y}px) scale(${s})`;
  };
  addEventListener("resize", fit);
  fit();

  const $ = (id) => document.getElementById(id);
  const scrub = $("scrub");
  const clockEl = $("clock");
  const select = $("scene");
  const loop = $("loop");
  scrub.max = String(duration);
  select.innerHTML =
    `<option value="">tutto il video</option>` +
    scenes.map((s) => `<option value="${s.id}">${s.id} (${s.from}–${s.to})</option>`).join("");

  const audio = music.file ? new Audio(`/${music.file}`) : null;
  // voce: un elemento audio per riga, avviato quando il tempo passa sul suo inizio (precisione di un fotogramma)
  const voices = voice.lines
    .filter((l) => !l.missing)
    .map((l) => {
      const el = new Audio(`/voce/${l.file}`);
      el.preservesPitch = true;
      el.playbackRate = l.factor;
      return { ...l, el };
    });
  const subtitle = $("subtitle");
  const syncVoices = (playingNow) => {
    let talking = false;
    for (const v of voices) {
      const inside = t >= v.start && t < v.end;
      talking ||= inside && t < (v.words.at(-1)?.end ?? v.end);
      const pos = (t - v.start) * v.factor;
      if (playingNow && inside) {
        if (v.el.paused) {
          v.el.currentTime = pos;
          v.el.play();
        } else if (Math.abs(v.el.currentTime - pos) > 0.08) v.el.currentTime = pos;
      } else if (!v.el.paused) v.el.pause();
    }
    // la musica si abbassa quando parla la voce (nel render lo fa il compressore di ffmpeg)
    if (audio) audio.volume = talking ? 0.35 : 1;
    const line = voices.find((v) => t >= (v.words[0]?.start ?? v.start) && t < (v.words.at(-1)?.end ?? v.end) + 0.2);
    subtitle.textContent = line ? `${line.id}: ${line.text}` : "";
  };
  let t = Number(params.get("t") ?? 0);
  let playing = false;
  let last = 0;

  const range = () => {
    const s = scenes.find((x) => x.id === select.value);
    return s && loop.checked ? [s.start, s.end] : [0, duration];
  };
  const show = () => {
    window.__seek(t);
    scrub.value = String(t);
    const s = scenes.find((x) => t >= x.start && t < x.end) ?? scenes[scenes.length - 1];
    const beat = s ? s.from + (t - s.start) / clock.period : 0;
    clockEl.textContent = `${t.toFixed(2)} s · beat ${beat.toFixed(1)} · ${s?.id ?? ""}`;
  };
  const jump = (to) => {
    t = to;
    if (audio) audio.currentTime = clock.musicStart + t;
    show();
    syncVoices(playing);
  };
  const toggle = () => {
    playing = !playing;
    $("play").textContent = playing ? "❚❚" : "▶";
    if (playing) {
      const [a, z] = range();
      if (t < a || t >= z - 0.01) jump(a);
      last = performance.now();
      if (audio) {
        audio.currentTime = clock.musicStart + t;
        audio.play();
      }
      requestAnimationFrame(tick);
    } else {
      audio?.pause();
      syncVoices(false);
    }
  };
  const tick = (now) => {
    if (!playing) return;
    // con l'audio l'orologio è la musica, così i tagli si giudicano a orecchio
    t = audio ? audio.currentTime - clock.musicStart : t + (now - last) / 1000;
    last = now;
    const [a, z] = range();
    if (t >= z) {
      if (loop.checked) jump(a);
      else {
        t = z - 1e-3;
        toggle();
      }
    }
    show();
    syncVoices(playing);
    requestAnimationFrame(tick);
  };

  $("play").onclick = toggle;
  scrub.oninput = () => jump(Number(scrub.value));
  select.onchange = () => {
    const s = scenes.find((x) => x.id === select.value);
    jump(s ? s.start : 0);
  };
  addEventListener("keydown", (e) => {
    if (e.target instanceof HTMLSelectElement) return;
    if (e.code === "Space") {
      e.preventDefault();
      toggle();
    } else if (e.code === "ArrowRight") jump(Math.min(duration, t + clock.period));
    else if (e.code === "ArrowLeft") jump(Math.max(0, t - clock.period));
    else if (e.key === "s" || e.key === "S") loop.checked = !loop.checked;
  });
  show();
}
