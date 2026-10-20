# Video di presentazione (Remotion)

Video commerciale per gli esercenti, circa 75 secondi, 1920 × 1080, senza audio, testi in italiano. Usa le
**schermate reali** del tutorial (`docs/tutorial/img`, generate da `apps/merchant/scripts/tutorial-screenshots.mjs`):
se l'app cambia, si rigenerano le schermate e il video le riprende da solo.

| Comando                              | Cosa fa                                                           |
| ------------------------------------ | ----------------------------------------------------------------- |
| `pnpm video`                         | apre Remotion Studio nel browser per vedere e ritoccare il video  |
| `pnpm video:render`                  | esporta `apps/video/out/presentazione-loyalty-wallet.mp4`         |
| `pnpm --filter @loyalty/video still` | esporta un fotogramma (`out/copertina.png`), utile come anteprima |

Prima di ogni comando `scripts/copy-screens.mjs` copia le schermate in `public/screens` (non versionata).

## Scene

| Scena      | Durata | Contenuto                                                                  |
| ---------- | ------ | -------------------------------------------------------------------------- |
| Apertura   | 5,5 s  | la carta a timbri che si riempie fino al premio                            |
| Problema   | 5 s    | tessere di carta e app del negozio barrate; il Wallet ce l'hanno già tutti |
| Iscrizione | 17 s   | cartello, modulo, codice SMS, carta pronta (schermate Android)             |
| In cassa   | 15 s   | scanner, timbro, protezione dai doppi timbri, premio (schermate iPhone)    |
| Titolare   | 16 s   | panoramica, clienti, personalizzazione della carta, messaggi               |
| Programmi  | 9 s    | timbri, punti e livelli, tessere prepagate, abbonamenti                    |
| Assistenza | 5 s    | il codice di "Invia diagnostica"                                           |
| Chiusura   | 5,5 s  | nome, promessa, richiesta di una demo                                      |

Durate e ordine sono in `src/Presentazione.tsx`; ogni scena è in `src/scenes/`, i componenti (telefono, finestra del
browser, carta a timbri, testi) in `src/ui/`. I testi dicono solo quello che l'app fa oggi: Apple Wallet è indicato
"in arrivo" (Fase 12).

**Licenza di Remotion**: gratuita per persone singole e aziende fino a 3 dipendenti; oltre serve la licenza
aziendale (<https://www.remotion.dev/license>).
