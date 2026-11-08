# voce/

Un file per riga della tabella **Voce** di `beats.md` (`v01.wav`, `v02a.wav`, …) più `voce.json` con durate e tempi
delle parole. Non versionati: si rigenerano.

## Generare

```sh
# segnaposto gratuito su Mac (voci italiane: Alice, Federica… → `say -v '?' | grep it_IT`)
pnpm --filter @loyalty/motion voce gen --provider say --voice Alice
pip install faster-whisper && pnpm --filter @loyalty/motion voce align   # tempi delle parole

# voce vera con ElevenLabs (tempi delle parole inclusi, niente align)
export ELEVENLABS_API_KEY=…  ELEVENLABS_VOICE_ID=…   # voce femminile italiana vivace dalla Voice Library
pnpm --filter @loyalty/motion voce gen --provider elevenlabs

# solo alcune righe, o rigenerare anche quelle già fatte
pnpm --filter @loyalty/motion voce gen --provider elevenlabs --only v04b,v06 --force
```

**Voce registrata**: salva qui `v01.wav`, `v02a.wav`… (una frase per file, un po' di silenzio prima e dopo), poi
`voce align`.

## Controllare

`pnpm --filter @loyalty/motion voce list` mostra per ogni riga dove cade nel video, quanto viene accelerata e gli avvisi
(frasi troppo lunghe per la loro finestra, frasi che si accavallano, parole di aggancio non trovate). Se una riga va
accelerata oltre ×1,3: accorcia il testo, sposta `fine` o rigenera con un ritmo più veloce.

Licenze: la voce TTS va usata secondo il piano del servizio (uso commerciale); niente cloni di voci di persone reali
senza il loro consenso.
