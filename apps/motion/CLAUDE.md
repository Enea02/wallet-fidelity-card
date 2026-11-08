# apps/motion — istruzioni per Claude Code

Promo in motion graphics di Loyalty Wallet: HTML + GSAP, render fotogramma per fotogramma con Playwright + ffmpeg.
Niente Remotion (quello è `apps/video`, il video lungo per gli esercenti: non toccarlo). Le regole del `CLAUDE.md` di
radice valgono per il resto del monorepo; qui contano queste.

## Fonti di verità (leggile prima di toccare una scena)

- `beats.md` — la beat sheet. **Unica fonte dei tempi**: inizio/fine delle scene in battute, cue SFX. Se cambi un tempo
  in una scena, aggiorna anche la riga di beats.md (colonne animazione/uscita/sfx).
- `beats.md`, tabella **Voce** — il copione della voce fuori campo: una riga = una frase = un file in `voce/`. Il
  testo a schermo e la voce devono dire cose coerenti (non per forza identiche); niente promesse che l'app non mantiene
  (vedi brand.md).
- `music.json` — dove cadono i beat (griglia `bpm`+`offset`, oppure `beats` rilevati da `scripts/beats.py`).
- `brand.md` — palette, font, tono, cosa si può dire del prodotto (e cosa no).
- `refs/` — contact sheet dei video di riferimento, con le note sul ritmo.

## Regole del motore (se le rompi, il render non è più deterministico)

- Ogni animazione è una funzione del tempo: solo tween sulla timeline `tl` della scena. **Mai** `setTimeout`,
  `setInterval`, `requestAnimationFrame`, `Date.now()`, video/GIF che si animano da soli, CSS `animation`/`transition`.
- Niente `Math.random()`: usa `rng(seme)` da `src/ui.js`.
- Tempi sempre con `b(n)` = secondi dall'inizio della scena alla battuta `n` (relativa alla scena, frazioni ammesse).
  Le durate dei singoli tween possono essere in secondi (es. `0.45`), ma ogni **attacco** cade su `b(...)`.
- **Stato iniziale con `gsap.set` quando costruisci la scena, mai `tl.set(…, 0)`**: un set a tempo esatto 0 di una
  sotto-timeline è ambiguo per GSAP e salta nei render (fotogramma vuoto o flash). Stesso motivo per
  `immediateRender: false` sui `fromTo` che non devono mostrare lo stato iniziale prima del loro attacco.
- Una scena = un file in `src/scenes/` che esporta `default function ({ el, tl, b, dur, beat, row })`; registrala in
  `src/scenes/index.js` con la stessa chiave della colonna `id` di beats.md.
- Le scene non si sovrappongono: le transizioni sono l'uscita della scena A (ultime battute) + l'entrata della B.
  Raccordi (match cut) = stesso oggetto nella stessa posizione/scala sull'ultimo fotogramma di A e sul primo di B.
- Palco fisso 1920×1080, coordinate in px assoluti. Colori solo da `C` (`src/ui.js`) / variabili CSS di `brand.css`.
- Schermate dell'app: solo quelle reali, con `screen("nome")` → `docs/tutorial/img/nome.png`. Non ridisegnare a mano
  schermate che esistono già. Se servono schermate nuove, si rigenerano con `apps/merchant/scripts/tutorial-screenshots.mjs`.
- Niente audio nelle scene: musica e voce le monta `scripts/audio.mjs` (render) e l'anteprima; gli SFX li sceglie e
  posiziona Enea nel montaggio (DaVinci Resolve) partendo dai marker.
- Testo che segue la voce: `w("parola", battutaDiRiserva)` dà il momento in cui la voce dice la parola (prima
  occorrenza nella scena; `w("parola", fb, 2)` per la seconda). Usalo per gli attacchi di testo che ripetono la voce;
  la riserva vale quando la voce non c'è ancora.
- Dopo aver cambiato il copione: `voce gen` (solo le righe cambiate), poi `voce list` e risolvi gli avvisi
  (accavallamenti, accelerazioni oltre ×1,3) accorciando il testo o spostando battuta/fine.

## Ciclo di lavoro su una scena

1. Leggi la riga della scena in `beats.md` e il file della scena.
2. Modifica.
3. Verifica guardando i fotogrammi, sempre prima di dire che è fatta:
   `pnpm --filter @loyalty/motion sheet --scene <id>` → leggi `out/sheet-<id>.jpg` (16 fotogrammi in griglia; i tempi
   sono stampati in console). Per un momento preciso: `pnpm --filter @loyalty/motion still <secondi>`.
   Controlla: niente testo tagliato o sovrapposto, attacchi sui beat, primo e ultimo fotogramma della scena puliti
   (sono quelli dei tagli), raccordi con la scena prima e dopo (`--from`/`--to` a cavallo del taglio).
4. Se cambi tempi o cue: aggiorna beats.md e rigenera i marker (`pnpm --filter @loyalty/motion markers`).
5. Riassumi in 2-3 righe cosa hai cambiato e cosa resta da decidere. Non fare commit se non richiesto.

## Comandi

- `pnpm --filter @loyalty/motion dev` — anteprima su http://127.0.0.1:5180 (spazio play/pausa, ←/→ un beat, S ripeti scena)
- `pnpm --filter @loyalty/motion render [--scene id | --from s --to s] [--fps 60]` — mp4 in `out/` (con la musica se
  `music.json` ha `file`)
- `pnpm --filter @loyalty/motion sheet [--scene id] [--tiles 16]` · `still <secondi>`
- `pnpm --filter @loyalty/motion beats music/brano.mp3 [--offset s]` — beat del brano → `music.json` (serve `pip install librosa`)
- `pnpm --filter @loyalty/motion markers [--fps 60]` — cue SFX e frasi → `out/markers.edl` (DaVinci) e `out/markers.csv`
- `pnpm --filter @loyalty/motion voce gen [--provider say|elevenlabs|bip] [--only id,…] [--force]` · `voce align` ·
  `voce list`
- `pnpm --filter @loyalty/motion audio` — stem voce/musica/mix per il montaggio
- `render --no-voice` / `--no-music` / `--no-audio` per escluderli
- `node apps/motion/scripts/refs.mjs refs/video.mp4` — contact sheet + tagli di un video di riferimento
