# Promo in motion graphics (HTML + GSAP)

Promo veloce di Loyalty Wallet (circa 25 s, 1920 × 1080, 60 fps), montato sui beat della musica. Le scene sono pagine
HTML animate con GSAP; il render porta la pagina a ogni fotogramma esatto e lo cattura con Playwright, poi ffmpeg fa
l'mp4. Il risultato è identico a ogni render. Usa le **schermate reali** del tutorial (`docs/tutorial/img`).

Diverso da `apps/video` (Remotion, 75 s, presentazione calma per gli esercenti): qui il ritmo comanda e gli effetti
sonori si fanno fuori, nel montaggio.

## Metodo

1. **Musica prima di tutto.** Metti il brano in `music/` e rileva i beat:
   `pnpm --filter @loyalty/motion beats music/brano.mp3` (serve `pip install librosa`; `--offset 1.8` per far partire
   il video da un punto preciso del brano). Finché non c'è, `music.json` è una griglia a 120 BPM.
2. **Riferimenti.** Metti in `refs/` 2-3 video con il ritmo e le transizioni che vuoi, poi
   `node apps/motion/scripts/refs.mjs refs/video.mp4` per avere contact sheet e durata media delle inquadrature, da
   passare a Claude.
3. **Beat sheet** (`beats.md`): una riga per scena, in battute, con cosa si vede, animazione, uscita e cue SFX. È la
   fonte unica dei tempi: il motore la legge direttamente.
4. **Una scena alla volta**: anteprima con "ripeti scena", poi contact sheet (`sheet --scene id`) da far guardare a
   Claude. Ritocca o rifai la scena finché tiene, poi passa alla successiva.
5. **Render completo** con la musica: `pnpm --filter @loyalty/motion render`.
6. **Voce.** Il copione è nella tabella "Voce" di `beats.md` (una riga = una frase = un file). `voce gen` la genera
   (segnaposto `say` su Mac, oppure ElevenLabs), `voce align` ricava i tempi delle parole se servono. Ogni frase parte
   sul suo beat, o aggancia una parola a un beat (`21@premio`); se sfora la sua finestra viene accelerata (max ×1,3).
   Nelle scene il testo può entrare quando la voce lo dice: `w("parola", battutaDiRiserva)`. Nel render la musica si
   abbassa da sola sotto la voce. Dettagli in `voce/README.md`.
7. **SFX nel montaggio.** `pnpm --filter @loyalty/motion markers` crea `out/markers.edl`: in DaVinci Resolve, timeline a
   60 fps che inizia a 01:00:00:00, tasto destro sulla timeline → Timelines → Import → Timeline Markers from EDL. Ogni
   marker ha il nome del suono previsto (le frasi della voce sono i marker color crema); i suoni veri li scegli tu dalla
   tua libreria. Per mixare in Resolve esporta gli stem con `pnpm --filter @loyalty/motion audio` (`out/voce.wav`,
   `out/musica.wav`, `out/mix.wav`, lunghi quanto il video: vanno a inizio timeline) e renderizza il video con
   `render --no-audio`.

## Comandi

| Comando                                                     | Cosa fa                                                        |
| ----------------------------------------------------------- | -------------------------------------------------------------- |
| `pnpm --filter @loyalty/motion dev`                         | anteprima su <http://127.0.0.1:5180> con barra, scene, audio   |
| `pnpm --filter @loyalty/motion render`                      | `out/loyalty-wallet-promo.mp4` (con la musica se c'è)          |
| `pnpm --filter @loyalty/motion render --scene 04-timbri`    | solo una scena (`--from 8 --to 12` per un intervallo, `--fps`) |
| `pnpm --filter @loyalty/motion sheet --scene 04-timbri`     | contact sheet di 16 fotogrammi (`out/sheet-*.jpg`)             |
| `pnpm --filter @loyalty/motion still 17.5`                  | un fotogramma in PNG                                           |
| `pnpm --filter @loyalty/motion beats music/brano.mp3`       | beat del brano → `music.json`                                  |
| `pnpm --filter @loyalty/motion markers`                     | cue SFX e frasi → `out/markers.edl` + `out/markers.csv`        |
| `pnpm --filter @loyalty/motion voce gen` / `align` / `list` | voce fuori campo (vedi `voce/README.md`)                       |
| `pnpm --filter @loyalty/motion audio`                       | stem `out/voce.wav`, `out/musica.wav`, `out/mix.wav`           |

Prerequisiti: `pnpm i`, ffmpeg 5 o più recente nel PATH (`brew install ffmpeg`), il Chromium di Playwright (già installato per gli e2e;
altrimenti `pnpm --filter @loyalty/motion exec playwright install chromium`). Render di 25 s a 60 fps: circa 1-2 minuti.

## Struttura

```
beats.md            beat sheet (tempi + cue SFX)
music.json          beat della musica
brand.md            palette, font, tono, cosa si può dire
CLAUDE.md           regole per Claude Code su questo pacchetto
index.html          palco 1920×1080 + controlli dell'anteprima
src/main.js         motore: beat sheet → timeline GSAP, window.__seek(t) per il render
src/beats.js        parsing di beats.md e orologio dei beat (usato anche dagli script)
src/ui.js           telefono, browser, carta a timbri, testo cinetico, whip, rng
src/scenes/*.js     una scena per file
scripts/            server, render, marker, beat, riferimenti
music/ refs/ voce/  brano, video di riferimento, voce (non versionati)
out/                render, contact sheet, marker (non versionati)
```

**Musica e SFX**: usa solo brani ed effetti con licenza per uso commerciale.
