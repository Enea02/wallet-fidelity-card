/*
 * Beat sheet → tempi. Modulo puro (niente DOM): lo usano l'anteprima, il render e scripts/markers.mjs.
 *
 * beats.md contiene una tabella con almeno le colonne `id`, `battute` (es. "10–16") e `sfx`.
 * music.json dice dove cadono i beat: griglia regolare (`bpm` + `offset`) oppure i beat rilevati
 * (`beats`, secondi nel brano, scritti da scripts/beats.py). Il video inizia sul beat 0 (= `offset` nel brano).
 */

/** Funzione battuta → secondi del video (battute frazionarie interpolate). */
export function beatClock(music) {
  const offset = Number(music.offset ?? 0);
  const grid = Array.isArray(music.beats) && music.beats.length > 1 ? music.beats.map(Number) : null;
  const period = grid ? (grid[grid.length - 1] - grid[0]) / (grid.length - 1) : 60 / Number(music.bpm ?? 120);
  const abs = (n) => {
    if (!grid) return offset + n * period;
    if (n <= 0) return grid[0] + n * period;
    const i = Math.floor(n);
    if (i >= grid.length - 1) return grid[grid.length - 1] + (n - (grid.length - 1)) * period;
    return grid[i] + (n - i) * (grid[i + 1] - grid[i]);
  };
  const zero = abs(0);
  return { at: (n) => abs(n) - zero, musicStart: zero, period };
}

const norm = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

/** Celle di tutte le tabelle markdown: [{ header: [...], rows: [{col: valore}] }]. */
function tables(markdown) {
  const out = [];
  let current = null;
  const cells = (l) =>
    l
      .trim()
      .replace(/^\||\|$/g, "")
      .split("|")
      .map((c) => c.trim());
  for (const line of markdown.split("\n")) {
    if (!line.trim().startsWith("|")) {
      current = null;
      continue;
    }
    const c = cells(line);
    if (!current) {
      current = { header: c.map(norm), rows: [] };
      out.push(current);
    } else if (!c.every((x) => /^:?-+:?$/.test(x) || x === "")) {
      current.rows.push(Object.fromEntries(current.header.map((h, i) => [h, c[i] ?? ""])));
    }
  }
  return out;
}

const num = (x) => Number(String(x).replace(",", "."));

/** Righe della prima tabella di beats.md che ha le colonne id e battute. */
export function parseBeatSheet(markdown) {
  const table = tables(markdown).find((t) => t.header.includes("id") && t.header.includes("battute"));
  if (!table) throw new Error("beats.md: manca la tabella con le colonne 'id' e 'battute'");
  return table.rows.map((row) => {
    const m = /(-?\d+(?:[.,]\d+)?)\s*[–—-]\s*(-?\d+(?:[.,]\d+)?)/.exec(row.battute);
    if (!m) throw new Error(`beats.md: battute non valide per "${row.id}": "${row.battute}" (atteso es. 10–16)`);
    return { ...row, from: num(m[1]), to: num(m[2]) };
  });
}

/**
 * Tabella della voce (colonne `riga`, `battuta`, `testo`, `fine`):
 *   battuta "4"          → la prima parola cade sul beat 4
 *   battuta "21@premio"  → la parola "premio" cade sul beat 21 (la frase parte prima quanto serve)
 *   fine "10" (opz.)     → l'ultima parola deve finire entro il beat 10: se serve la frase si accelera
 */
export function parseVoiceSheet(markdown) {
  const table = tables(markdown).find((t) => t.header.includes("riga") && t.header.includes("testo"));
  if (!table) return [];
  return table.rows
    .filter((r) => r.riga && r.testo)
    .map((r) => {
      const m = /^\s*(-?\d+(?:[.,]\d+)?)\s*(?:@\s*(.+))?$/.exec(r.battuta);
      if (!m)
        throw new Error(`beats.md: battuta non valida per la voce "${r.riga}": "${r.battuta}" (es. 4 o 21@premio)`);
      return {
        id: r.riga,
        text: r.testo,
        beat: num(m[1]),
        anchor: m[2] ? normWord(m[2]) : null,
        endBeat: r.fine ? num(r.fine) : null,
      };
    });
}

/** Parola normalizzata per i confronti: minuscole, senza accenti né punteggiatura. */
export function normWord(w) {
  return norm(String(w))
    .replace(/[^\p{L}\p{N}']/gu, "")
    .replace(/^'+|'+$/g, "");
}

/** Parole del testo (per sostituire quelle trascritte se il conteggio coincide). */
export const scriptWords = (text) => text.split(/\s+/).map(normWord).filter(Boolean);

const MAX_SPEEDUP = 1.3;

/**
 * Tempi della voce nel video. `voce` = contenuto di voce/voce.json ({ lines: { id: { file, duration, words } } }).
 * Ogni riga: start (inizio del file nel video), factor (accelerazione), words con tempi assoluti nel video.
 */
export function voiceTimeline(markdown, music, voce) {
  const clock = beatClock(music);
  const warnings = [];
  const lines = parseVoiceSheet(markdown).map((line) => {
    const clip = voce?.lines?.[line.id];
    if (!clip) {
      warnings.push(`voce ${line.id}: manca l'audio (pnpm --filter @loyalty/motion voce gen)`);
      return { ...line, missing: true };
    }
    const words = clip.words ?? [];
    let a = 0;
    if (line.anchor) {
      a = words.findIndex((w) => normWord(w.w).startsWith(line.anchor));
      if (a < 0) {
        warnings.push(`voce ${line.id}: la parola "${line.anchor}" non è tra quelle allineate, aggancio sulla prima`);
        a = 0;
      }
    }
    const anchorAt = words[a]?.start ?? 0;
    const lastEnd = words.length ? words[words.length - 1].end : clip.duration;
    const T = clock.at(line.beat);
    let factor = 1;
    if (line.endBeat != null) {
      const room = clock.at(line.endBeat) - T;
      const need = lastEnd - anchorAt;
      if (room <= 0) warnings.push(`voce ${line.id}: "fine" (${line.endBeat}) non è dopo la battuta`);
      else if (need > room) factor = need / room;
      if (factor > MAX_SPEEDUP) {
        warnings.push(
          `voce ${line.id}: andrebbe accelerata ×${factor.toFixed(2)}, limitata a ×${MAX_SPEEDUP}: accorcia il testo o sposta "fine"`,
        );
        factor = MAX_SPEEDUP;
      }
    }
    const start = T - anchorAt / factor;
    return {
      ...line,
      file: clip.file,
      factor,
      start,
      end: start + clip.duration / factor,
      words: words.map((w) => ({ w: w.w, start: start + w.start / factor, end: start + w.end / factor })),
    };
  });
  const ok = lines.filter((l) => !l.missing).sort((x, y) => x.start - y.start);
  for (let i = 1; i < ok.length; i++) {
    const prevEnd = ok[i - 1].words.at(-1)?.end ?? ok[i - 1].end;
    const nextStart = ok[i].words[0]?.start ?? ok[i].start;
    if (nextStart < prevEnd - 0.05)
      warnings.push(`voce ${ok[i - 1].id} e ${ok[i].id} si sovrappongono di ${(prevEnd - nextStart).toFixed(2)} s`);
  }
  for (const l of ok) if (l.start < 0) warnings.push(`voce ${l.id}: inizia prima del video (${l.start.toFixed(2)} s)`);
  return { lines, warnings };
}

/** Cue SFX della colonna `sfx`: "whoosh@0; impact@2.5" → battute relative all'inizio della scena. */
export function parseSfx(cell) {
  return String(cell ?? "")
    .split(/[;,]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const m = /^(.+?)\s*@\s*(-?\d+(?:[.,]\d+)?)$/.exec(s);
      return m ? { name: m[1].trim(), beat: Number(m[2].replace(",", ".")) } : { name: s, beat: 0 };
    });
}

/** Scene con i tempi in secondi del video (e la voce, se c'è voce/voce.json). */
export function timeline(markdown, music, voce = null) {
  const clock = beatClock(music);
  const scenes = parseBeatSheet(markdown).map((r) => ({
    ...r,
    start: clock.at(r.from),
    end: clock.at(r.to),
    sfxCues: parseSfx(r.sfx).map((c) => ({ ...c, time: clock.at(r.from + c.beat) })),
  }));
  for (let i = 1; i < scenes.length; i++)
    if (scenes[i].from < scenes[i - 1].to)
      throw new Error(`beats.md: "${scenes[i].id}" inizia prima della fine di "${scenes[i - 1].id}"`);
  const voice = voiceTimeline(markdown, music, voce);
  return { scenes, clock, voice, duration: scenes.length ? scenes[scenes.length - 1].end : 0 };
}
