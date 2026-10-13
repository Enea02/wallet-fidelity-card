# Brief per Claude Design — Loyalty Wallet

## Il prodotto
Una **carta fedeltà digitale a timbri** per piccoli negozi locali. Il primo cliente è un parrucchiere: ogni 10 tagli, uno gratis. Lo stesso prodotto verrà venduto a barbieri, estetiste, bar e pizzerie, quindi **ogni negozio personalizza logo e colore**.

Ci sono tre superfici da progettare:

1. **La carta nel Wallet** (Google Wallet e Apple Wallet) del cliente finale.
2. **Le pagine web di iscrizione**, l'unica interfaccia del cliente finale oltre alla carta.
3. **L'app esercente** per **iOS, Android e Web** (stessa app, stesse funzioni), usata dal titolare e dallo staff per timbrare e gestire tutto: dal telefono, dal tablet o dal PC in cassa.

Il cliente finale **non ha account né area personale**: si iscrive dal web una volta, aggiunge la carta al Wallet e da lì in poi esiste solo la carta.

## Chi lo usa
- **Cliente finale**: 18–70 anni, da smartphone, in piedi al bancone dopo aver inquadrato un QR. Vuole finire in 30 secondi e avere la carta nel telefono.
- **Operatore del negozio**: timbra tra un cliente e l'altro, spesso con le mani occupate o bagnate. Servono bersagli grandi, pochissimi tocchi, feedback immediato.
- **Titolare**: usa la stessa app per numeri, clienti e impostazioni, da telefono, tablet o computer (web).

## Direzione visiva
- Calda, curata, artigianale, non da app bancaria. Deve sembrare "la carta timbri di carta, ma più bella".
- **Tema per negozio** (carta e web di iscrizione): un colore principale e un logo. Tutto deve funzionare con qualsiasi colore scelto, garantendo contrasto WCAG AA. Indica come derivare le tinte secondarie dal colore principale.
- **App esercente**: ha la **nostra** identità di prodotto (unica app per tutti i negozi), con logo e colore del negozio come accento nelle schermate operative e nelle anteprime della carta.
- Neutri caldi come base, tipografia leggibile, modalità chiara e scura.
- Il **timbro** è l'elemento identitario: progetta un sistema di timbri (vuoto, pieno, premio) riconoscibile anche piccolo, coerente tra carta, web e app.
- Testi in italiano.

## Consegna 1 — La carta nel Wallet
I wallet hanno layout fissi: possiamo progettare **immagini, colori e testi**, non la struttura.

### Google Wallet (carta fedeltà)
- **Logo del programma**: quadrato, almeno 660×660 px, ritagliato a cerchio.
- **Colore di sfondo**: uno solo (esadecimale).
- **Immagine hero/banner**: orizzontale, circa 1032×336 px. Qui va la **griglia dei timbri**.
- Testi: nome del negozio, nome del programma, "Timbri 3 / 10", "Premi 0", un modulo di testo ("Come funziona" oppure "Taglio gratis disponibile!"), QR code con codice breve sotto.

### Apple Wallet (storeCard)
- **icon.png** 29×29 (+ @2x, @3x), **logo.png** fino a 160×50 (+ @2x, @3x).
- **strip.png** 375×123 (@2x 750×246, @3x 1125×369): anche qui la **griglia dei timbri**.
- Colori: sfondo, testo, etichette.
- Campi: Timbri, Premi, Cliente. Retro: regolamento e contatto del negozio per privacy e cancellazione dei dati (il cliente non ha altri canali).

### Cosa ci serve
1. Un **sistema di immagini timbri** generabile da codice per ogni stato da 0 a N timbri (N tra 5 e 20, caso principale 10), più lo stato "premio disponibile". Indica la griglia per N diversi (10 = 2×5, 8 = 2×4, 12 = 2×6).
2. Mockup della carta Google e Apple in tre stati: **nuova (0/10)**, **a metà (6/10)**, **premio sbloccato**.
3. Due temi di prova: un parrucchiere (colore scuro elegante) e un bar (colore chiaro e vivace).
4. Testi: etichette, modulo "Come funziona", notifica di premio sbloccato, testo del retro.
5. **Carta disattivata** (cliente cancellato o negozio sospeso): come appare.

## Consegna 2 — Web di iscrizione (cliente finale)
Un flusso lineare, mobile first (360 px), nessun login, nessun menu. Tema del negozio.

1. **Iscrizione** (`/<negozio>`): logo e nome del negozio, beneficio in una riga ("Ogni 10 tagli, uno gratis"), "Niente app da scaricare", form nome + telefono, consenso privacy obbligatorio, consenso marketing facoltativo, pulsante principale.
2. **Verifica telefono**: codice OTP a 6 cifre (autocompletamento da SMS), reinvio dopo 60 secondi, cambio numero.
3. **Carta pronta**: pulsanti ufficiali "Aggiungi a Google Wallet" / "Aggiungi ad Apple Wallet" rispettando le linee guida dei badge, mostrando quello giusto per il dispositivo. Su desktop: QR da inquadrare col telefono.
4. **Già iscritto**: stesso numero riconosciuto dopo l'OTP, messaggio "Bentornato, la tua carta è questa" con il pulsante Wallet (timbri conservati).
5. **Stati**: telefono non valido, codice sbagliato o scaduto, troppi tentativi, negozio inesistente o sospeso, caricamento.
6. **Disiscrizione dalle promozioni**: pagina singola raggiunta da link nei messaggi promozionali, con conferma.
7. **Informativa privacy** del negozio: pagina di testo leggibile.

### Materiale stampabile
- **Cartello da bancone** A5 verticale: logo del negozio, beneficio in grande, QR verso l'iscrizione, "Niente app da scaricare", 3 passi illustrati (inquadra, iscriviti, aggiungi al Wallet).

## Consegna 3 — App esercente (iOS + Android + Web)
Un'unica app realizzata in React Native (Expo) e pubblicata su App Store, Google Play e come web app. Stesso design su tutte le piattaforme, rispettando le convenzioni di ciascuna (navigazione, sheet, aptica e tasto indietro su mobile; hover, scorciatoie da tastiera e layout ampio sul web).

### Formati
- **Telefono** (iOS/Android/browser mobile): verticale, uso con una mano.
- **Tablet**: verticale e orizzontale, tipico al bancone.
- **Desktop web** (≥ 1024 px): PC in cassa o ufficio del titolare. La dashboard e la lista clienti sfruttano lo spazio (più colonne, tabella clienti con dettaglio affiancato).

### Navigazione
- **Operatore**: scanner come schermata iniziale, nient'altro oltre al profilo.
- **Titolare**: su mobile tab bar con Scansiona · Dashboard · Clienti · Impostazioni; su tablet orizzontale e desktop barra laterale con le stesse voci.

### Schermate
1. **Accesso**: login email e password, recupero password, accettazione invito (da link email).
2. **Scelta negozio** (solo per chi ne gestisce più di uno).
3. **Scanner**: fotocamera a schermo pieno con mirino, torcia, inserimento manuale del codice breve. Deve essere usabile con una mano.
   - **Variante web/desktop**: due modalità affiancate o commutabili, **webcam** e **lettore QR esterno** (USB/Bluetooth, che scrive il codice come una tastiera). Per il lettore serve uno stato "In attesa di scansione…" ben visibile, sempre pronto, che non richieda clic tra un cliente e l'altro.
4. **Scheda cliente** (sheet su mobile, pannello o dialog su desktop, dopo la scansione): nome, griglia timbri, premi disponibili; azioni grandi "+1 timbro" e "Riscatta premio"; "Annulla ultimo timbro" visibile per 5 minuti; "Cliente successivo" che torna allo scanner.
5. **Feedback**: timbro aggiunto, **premio sbloccato** (momento celebrativo breve), premio riscattato, cooldown attivo ("timbro già dato da poco"), QR non valido o di un altro negozio, rete assente.
6. **Dashboard**: clienti iscritti, timbri e premi della settimana, grafico delle ultime 8 settimane, clienti inattivi da più di 60 giorni.
7. **Clienti**: lista con ricerca; dettaglio con griglia timbri e storico; correzione manuale del saldo con motivo; revoca consenso marketing; **elimina cliente** con conferma forte.
8. **Impostazioni carta**: logo (galleria + ritaglio quadrato), colore, timbri necessari, testo premio, cooldown; **anteprima live** della carta Google e Apple.
9. **Staff**: lista, invita operatore, cambia ruolo, rimuovi.
10. **Promozione**: testo breve, anteprima della notifica sul telefono del cliente, numero di destinatari con consenso, limite settimanale.
11. **Cartello QR**: anteprima del cartello A5, condividi o stampa.
12. **Profilo/negozio**: account, cambio negozio, logout. Stato abbonamento: in sola lettura nelle app iOS/Android; **solo nella web app** anche gestione del pagamento (piano, metodo di pagamento, fatture).
13. Stati vuoti (nessun cliente ancora), caricamenti, errori, permesso fotocamera negato (mobile e browser), lettore QR non rilevato.

### Asset app
- Icona app (iOS, Android adaptive, favicon e icone PWA per il web), splash screen, screenshot per gli store.

## Vincoli tecnici
- Web di iscrizione: Next.js + React. App esercente: React Native (Expo) con React Native Web per la versione browser, quindi componenti progettati una volta per tutte e tre le piattaforme. Usa token di design (colori, spaziature, raggi, tipografia) condivisibili tra web di iscrizione e app.
- Le immagini dei timbri della carta saranno generate lato server (`satori` / `@vercel/og`): forme semplici (cerchi, icone SVG, testo), niente texture o foto.
- Regola esplicita per derivare i colori dal colore del negozio, in chiaro e scuro.
- Componenti riutilizzabili: griglia timbri, anteprima carta, pulsanti wallet, campo OTP, toast/feedback, scheda cliente.

## Cosa consegnare
- Design system essenziale: token, tipografia, sistema timbri, componenti (web e app).
- Asset e mockup della carta Google e Apple, con le regole per generarli.
- Schermate del web di iscrizione (mobile, più la variante desktop della pagina finale).
- Schermate dell'app esercente in versione telefono; scanner, dashboard e clienti anche in versione tablet e desktop web.
- Cartello A5 da bancone.
- Note per lo sviluppo: stati, animazioni (premio sbloccato, timbro aggiunto), comportamento con colori diversi.
