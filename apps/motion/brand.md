# Brand — Loyalty Wallet (per il video)

Ricavato dalla repo: `packages/shared/theme.ts` (porting di `docs/design/lw-core.js`), `apps/video/src/ui/theme.ts`,
`docs/design/`, `README.md`, schermate in `docs/tutorial/img`. Se uno di questi cambia, aggiorna qui.

## Prodotto in una frase

Carta fedeltà a timbri (es. "ogni 10 tagli, uno è gratis") nel Wallet del telefono, per piccoli negozi. Il cliente
inquadra il QR del cartello, scrive nome e telefono, conferma con un codice SMS e salva la carta: **nessuna app da
scaricare**. In cassa l'operatore scansiona e dà il timbro con un tocco; al decimo si sblocca il premio. Il titolare
vede clienti, timbri, premi e manda messaggi promozionali (solo a chi ha dato il consenso).

## Cosa si può dire (e cosa no)

- Sì: Google Wallet oggi; "nel Wallet del telefono" come formula generica.
- **Apple Wallet è "in arrivo"** (firma dei pass in Fase 12): non mostrarlo come disponibile, niente iPhone con la carta
  nel Wallet Apple. La schermata `cliente-07-carta-pronta-iphone` mostra la pagina, non il pass.
- Anche punti e livelli, tessere prepagate e abbonamenti esistono (Fasi 9.5–9.6): usabili in un'eventuale scena "programmi".
- Niente numeri inventati (tempi di iscrizione, % di clienti che tornano): i numeri a schermo sono quelli delle
  schermate demo.
- Messaggi: solo ai clienti con consenso marketing ("Richiamali con un messaggio" va bene, "scrivi a tutti" no).

## Pubblico e tono

Titolari di piccoli negozi: parrucchieri, barbieri, bar, estetiste. Frasi corte, concrete, in seconda persona.
Niente gergo tecnico (non "PWA", "pass", "multi-tenant"). Il video è un promo veloce (25 s circa), non un tutorial.

## Voce fuori campo

Femminile, italiana, vivace e sorridente: una persona che te lo racconta al bancone, non uno spot radio. Ritmo
serrato, parole pulite, nessuna enfasi da televendita. Dà del tu al titolare. "Loyalty Wallet" si pronuncia
all'inglese: se il TTS sbaglia, scrivilo foneticamente solo nel testo della voce in beats.md.

## Colori

| token    | hex       | uso                                                   |
| -------- | --------- | ----------------------------------------------------- |
| bg       | `#F6F2EC` | carta: sfondo chiaro principale                       |
| surface  | `#FFFDFA` | superfici, schermi                                    |
| ink      | `#2A211C` | testo, sfondi scuri                                   |
| ink2     | `#6B5E55` | testo secondario                                      |
| line     | `#DDD4CB` | bordi                                                 |
| wine     | `#5B1F2E` | colore del brand: sfondi forti, etichette, chiusura   |
| wineSoft | `#F1E3E5` | sfondi tenui                                          |
| shop     | `#7C3AED` | colore del negozio demo (Salone Demo) nelle schermate |
| ok       | `#1F7A4D` | conferme                                              |

Ritmo cromatico del video: alternanza **vino ↔ carta** per i tagli, viola solo dove c'è la carta del negozio.

## Tipografia

Bricolage Grotesque (variabile, `@fontsource-variable/bricolage-grotesque`, servita in locale: nessun download durante
il render). Titoli 800 con tracking stretto (-0.045em), testi 600–700. Cifre tabellari nei contatori.

## Elementi riconoscibili

- La carta a timbri: 9 caselle tratteggiate + premio (regalo), forbici come timbro, contatore "n / 10", monogramma
  "D" per Salone Demo. Componente: `stampCard()` in `src/ui.js`.
- Il cartello da bancone con il QR ("Niente app da scaricare.", 3 passi numerati): `cliente-01-cartello`.
- Logo provvisorio: cerchio carta con l'icona del regalo + "Loyalty Wallet" (come la chiusura di `apps/video`).

## Schermate più utili (`docs/tutorial/img`)

- Cliente: `cliente-01-cartello`, `cliente-04-form-compilato`, `cliente-05-codice-sms`, `cliente-06-carta-pronta-android`
- Cassa: `cassa-02-scanner-codice`, `cassa-04-timbro-dato`, `cassa-07-carta-quasi-completa`, `cassa-08-premio-sbloccato`
- Titolare: `titolare-01-panoramica`, `titolare-02-clienti`, `titolare-08-carta`, `titolare-10-messaggi`,
  `titolare-14-panoramica-telefono`
- Programmi: `punti-01-scheda`, `punti-03-nuovo-livello`, `tessere-06-carnet-scalato`, `tessere-07-abbonamento-valido`
