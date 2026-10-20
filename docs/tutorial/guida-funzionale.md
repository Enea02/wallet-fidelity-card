# Guida all'uso — esercente e cliente

Come si usa Loyalty Wallet nel negozio: il cliente che si iscrive, l'operatore in cassa e il titolare che gestisce
carta, clienti e promozioni. Le schermate sono quelle vere dell'app, prese nel negozio di esempio **Salone Demo**
(carta a timbri: ogni 10 tagli, uno è gratis) e nel **Bar Punti Demo** (carta a punti con livelli).

| Chi                  | Cosa usa                                            | Capitolo                                                                                                             |
| -------------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Cliente del negozio  | una pagina web per iscriversi e la carta nel Wallet | [1. Il cliente si iscrive](#1-il-cliente-si-iscrive)                                                                 |
| Operatore (in cassa) | l'app esercente: Scanner e Profilo                  | [2. Accesso](#2-accesso-allapp-esercente), [3. In cassa](#3-in-cassa-timbri-e-premi)                                 |
| Titolare             | l'app esercente con tutte le sezioni                | [4. Area titolare](#4-area-titolare), [5. Tessere](#5-tessere-prepagate-e-abbonamenti), [6. Punti](#6-carta-a-punti) |

> **Apple Wallet è in arrivo.** Oggi la carta si salva in Google Wallet; chi ha un iPhone, per ora, mostra in cassa
> il QR e il codice della sua carta (vedi [1.4](#14-la-carta-è-pronta)).

---

## 1. Il cliente si iscrive

Il cliente non scarica nessuna app e non crea nessun account: inquadra un QR, scrive nome e telefono, conferma con un
codice SMS e salva la carta nel Wallet.

### 1.1 Il cartello al bancone

Il titolare stampa il cartello A5 dalla sezione **Cartello** dell'app e lo mette vicino alla cassa. Il QR porta alla
pagina di iscrizione del negozio; la griglia ripete la regola della carta.

<img src="img/cliente-01-cartello.png" alt="Cartello A5 da bancone" width="640">

### 1.2 La pagina di iscrizione

Inquadrato il QR si apre la pagina con i colori del negozio: la regola ("Ogni 10 tagli, uno è gratis."), la carta
vuota e il modulo. Se il negozio vende tessere prepagate o abbonamenti, sotto la griglia ci sono anche i loro link.

<img src="img/cliente-02-iscrizione.png" alt="Pagina di iscrizione" width="320">

Il consenso all'informativa è obbligatorio, quello alle offerte facoltativo. Premendo **Crea la mia carta** senza
compilare, un riepilogo in alto dice quanti campi sistemare e ogni campo spiega cosa manca.

<img src="img/cliente-03-errori-form.png" alt="Errori del modulo" width="320">
<img src="img/cliente-04-form-compilato.png" alt="Modulo compilato" width="320">

### 1.3 Il codice SMS

Arriva un SMS con 6 cifre; il codice si verifica da solo alla sesta cifra (si può anche incollare). Dopo un minuto si
può chiedere un nuovo codice; **Cambia numero** torna al modulo. Con un codice sbagliato la pagina dice quanti
tentativi restano: dopo 5 errori il numero si blocca per 15 minuti.

<img src="img/cliente-05-codice-sms.png" alt="Schermata del codice SMS" width="320">
<img src="img/cliente-10-codice-errato.png" alt="Codice errato" width="320">

### 1.4 La carta è pronta

Cosa succede dopo dipende dal telefono:

- **Android**: pulsante **Aggiungi a Google Wallet**. La carta si aggiorna da sola a ogni timbro.
- **iPhone**: finché non arriva Apple Wallet, la pagina mostra il QR e il codice di 8 caratteri da far vedere in
  cassa (conviene fare uno screenshot).
- **Computer**: un QR da inquadrare col telefono per salvare la carta lì.

<img src="img/cliente-06-carta-pronta-android.png" alt="Carta pronta su Android" width="320">
<img src="img/cliente-07-carta-pronta-iphone.png" alt="Carta pronta su iPhone" width="320">

<img src="img/cliente-08-da-computer.png" alt="Carta pronta da computer" width="640">

### 1.5 Chi si iscrive di nuovo

Chi si iscrive di nuovo con lo stesso numero (telefono nuovo, carta cancellata dal Wallet…) ritrova la **stessa
carta**, con i timbri che aveva.

<img src="img/cliente-09-cliente-di-ritorno.png" alt="Cliente di ritorno con 6 timbri" width="320">

### 1.6 Negozio a punti

In un negozio a punti la frase spiega la regola ("1 punto per ogni euro: da 100 punti sei Gold.") e la carta mostra
punti e livello invece della griglia dei timbri.

<img src="img/cliente-11-iscrizione-punti.png" alt="Iscrizione a un negozio a punti" width="320">
<img src="img/cliente-12-carta-punti-pronta.png" alt="Carta a punti pronta" width="320">

### 1.7 Tessere prepagate e abbonamenti

Ogni tessera ha la sua pagina e il suo cartello. Il cliente la crea da lì, poi la paga in cassa, dove viene attivata
([capitolo 5](#5-tessere-prepagate-e-abbonamenti)).

<img src="img/cliente-14-pagina-carnet.png" alt="Pagina di un carnet" width="320">
<img src="img/cliente-13-pagina-abbonamento.png" alt="Pagina di un abbonamento" width="320">

### 1.8 Privacy e promozioni

L'informativa privacy si apre dal modulo. Ogni promozione ricevuta ha un link per non riceverne più: un tocco e la
carta resta attiva, con tutti i timbri.

<img src="img/cliente-15-informativa.png" alt="Informativa privacy" width="320">
<img src="img/cliente-16-disiscrizione.png" alt="Disiscrizione dalle promozioni" width="320">
<img src="img/cliente-17-disiscrizione-fatta.png" alt="Disiscrizione confermata" width="320">

Se il servizio del negozio è sospeso, le iscrizioni si fermano con un messaggio chiaro; chi ha già la carta la ritrova
nel Wallet appena il servizio riprende.

<img src="img/cliente-18-negozio-sospeso.png" alt="Negozio sospeso" width="320">

---

## 2. Accesso all'app esercente

L'app esercente è una sola per iPhone, Android e computer. Si entra con l'email con cui il titolare ha invitato la
persona; l'accesso resta attivo sul dispositivo finché non si esce. **Password dimenticata?** manda un link per
sceglierne una nuova.

<img src="img/app-01-accesso.png" alt="Accesso staff" width="300">
<img src="img/app-02-credenziali-errate.png" alt="Credenziali errate" width="300">
<img src="img/app-03-password-dimenticata.png" alt="Password dimenticata" width="300">

Chi lavora in più negozi sceglie dove si trova oggi; la scelta viene ricordata e si cambia dal Profilo.

<img src="img/app-04-scelta-negozio.png" alt="Scelta del negozio" width="300">

---

## 3. In cassa: timbri e premi

L'operatore vede solo **Scanner** e **Profilo**. Il titolare ha le stesse schermate nella voce **Scanner** del menu.

### 3.1 Leggere la carta

Tre modi, che l'app ricorda sul dispositivo:

- **Fotocamera**: si inquadra il QR della carta (nel Wallet o nello screenshot dell'iPhone).
- **Lettore**: un lettore QR USB o Bluetooth legge il codice da solo; il campo resta pronto anche per il cliente
  successivo, senza toccare nulla.
- **Codice**: si scrive a mano il codice di 8 caratteri sotto il QR.

<img src="img/cassa-00-scanner-fotocamera.png" alt="Scanner con fotocamera" width="300">
<img src="img/cassa-01-scanner-lettore.png" alt="Scanner con lettore esterno" width="300">
<img src="img/cassa-02-scanner-codice.png" alt="Scanner con codice a mano" width="300">

Con la fotocamera la scheda del cliente si apre da sola appena il QR è leggibile.

<img src="img/cassa-00b-fotocamera-letta.png" alt="Carta letta dalla fotocamera" width="300">

### 3.2 La scheda del cliente e il timbro

Letta la carta si apre la scheda: nome, da quando è cliente, visite e timbri. **+1 timbro** aggiunge il timbro e la
carta nel Wallet si aggiorna da sola. Per 5 minuti resta il pulsante **Annulla ultimo timbro**, per gli errori.

<img src="img/cassa-03-scheda-cliente.png" alt="Scheda del cliente" width="300">
<img src="img/cassa-04-timbro-dato.png" alt="Timbro aggiunto" width="300">
<img src="img/cassa-06-timbro-annullato.png" alt="Timbro annullato" width="300">

Se il cliente ha avuto un timbro da poco (il titolare decide quanto tempo deve passare; qui 60 minuti), l'app lo dice
e propone **Ok, niente timbro**. **Aggiungi comunque** lo dà lo stesso, ma resta nel registro.

<img src="img/cassa-05-cooldown.png" alt="Timbro già dato da poco" width="300">

### 3.3 Premio sbloccato e riscatto

All'ultimo timbro la carta si completa: **Riscatta ora** oppure **Alla prossima visita** (il premio resta sulla
carta). Il riscatto chiede una conferma.

<img src="img/cassa-07-carta-quasi-completa.png" alt="Carta a 9 timbri su 10" width="300">
<img src="img/cassa-08-premio-sbloccato.png" alt="Premio sbloccato" width="300">

<img src="img/cassa-09-conferma-riscatto.png" alt="Conferma del riscatto" width="300">
<img src="img/cassa-10-premio-riscattato.png" alt="Premio riscattato" width="300">

### 3.4 Quando qualcosa non va

- La carta è di un altro negozio, o il QR non è una carta: l'app lo dice e non apre nessuna scheda.
- Senza rete: un avviso in alto e i pulsanti disattivati, così nessun timbro va perso o dato due volte.

<img src="img/cassa-11-carta-altro-negozio.png" alt="Carta di un altro negozio" width="300">
<img src="img/cassa-12-senza-rete.png" alt="Senza rete" width="300">

### 3.5 Profilo e assistenza

Il Profilo mostra chi è collegato, il negozio, il ruolo e la versione dell'app. Se qualcosa non funziona, **Invia
diagnostica all'assistenza** manda all'assistenza gli ultimi passaggi dell'app (nessun dato dei clienti) e mostra un
codice `DIAG-…` da comunicare. Anche ogni messaggio di errore ha il suo codice `ERR-…`: basta dettarlo.

<img src="img/cassa-13-profilo-operatore.png" alt="Profilo dell'operatore" width="300">
<img src="img/cassa-14-diagnostica-inviata.png" alt="Diagnostica inviata con codice ticket" width="300">

---

## 4. Area titolare

Sul computer le sezioni sono nella barra laterale; sul telefono in basso, con **Scansiona** sempre in alto.

### 4.1 Panoramica

I numeri della settimana (clienti iscritti, timbri, premi sbloccati, clienti inattivi), il grafico delle ultime 8
settimane e chi non torna da più di 60 giorni. Da qui si scarica anche il cartello.

![Panoramica](img/titolare-01-panoramica.png)

<img src="img/titolare-14-panoramica-telefono.png" alt="Panoramica sul telefono" width="300">

### 4.2 Clienti

Ricerca per nome, telefono o codice della carta, con i filtri **Tutti**, **Con premio** e **Inattivi**. Il telefono si
vede sempre mascherato. Scelto un cliente compaiono saldo, consenso alle promozioni e storico.

![Elenco clienti](img/titolare-02-clienti.png)

![Dettaglio di un cliente](img/titolare-03-dettaglio-cliente.png)

**Correggi saldo** cambia timbri e premi con un motivo obbligatorio (timbro dimenticato, errore dello staff, carta di
carta vecchia, altro), che resta nello storico.

![Correzione del saldo](img/titolare-04-correzione-saldo.png)

![Correzione salvata nello storico](img/titolare-05-correzione-salvata.png)

**Revoca consenso** toglie il cliente dalle promozioni (dall'app si può solo togliere: lo riattiva il cliente,
iscrivendosi di nuovo). **Cancella cliente** elimina i suoi dati dopo una doppia conferma con il codice della carta.

![Revoca del consenso](img/titolare-06-revoca-consenso.png)

![Cancellazione del cliente](img/titolare-07-cancellazione.png)

### 4.3 Carta

Carta attiva o spenta, timbri **oppure** punti, logo, colore, numero di timbri e premio, con l'anteprima della carta
in Google Wallet e Apple Wallet (nuova, a metà, con premio). Dopo il salvataggio le carte dei clienti si aggiornano
entro qualche minuto.

![Impostazioni della carta](img/titolare-08-carta.png)

### 4.4 Staff

Si invita con email, nome e ruolo: l'**operatore** dà timbri e riscatta premi, il **titolare** vede anche clienti,
statistiche e impostazioni. Per ogni persona: reinvio dell'invito, cambio di ruolo, rimozione.

![Staff](img/titolare-09-staff.png)

### 4.5 Messaggi

Un messaggio promozionale a settimana, che arriva come notifica sulla carta nel Wallet dei soli clienti che hanno
dato il consenso. L'anteprima mostra come apparirà su iPhone e Android; prima dell'invio c'è una conferma.

![Messaggio promozionale](img/titolare-10-messaggi.png)

![Conferma dell'invio](img/titolare-11-conferma-messaggio.png)

### 4.6 Cartello e Profilo

Il cartello da bancone si scarica in PDF (A5) o si stampa, sempre con colore, logo e premio attuali. Nel Profilo, come
per l'operatore, c'è **Invia diagnostica**.

![Cartello da bancone](img/titolare-12-cartello.png)

![Profilo del titolare](img/titolare-13-profilo.png)

---

## 5. Tessere prepagate e abbonamenti

Sezione **Tessere** del titolare. Due tipi:

- **A consumo** (es. "Carnet 10 pieghe"): un numero di utilizzi che si scalano a ogni visita e si ricaricano.
- **Abbonamento** (es. "-20% su tutti i trattamenti"): un vantaggio valido fino a una scadenza; il rinnovo allunga
  dalla scadenza.

Ogni tessera ha la sua pagina di iscrizione e il suo cartello; quando non la vendi più, la rendi non disponibile.

![Elenco delle tessere](img/tessere-01-elenco.png)

![Nuova tessera a consumo](img/tessere-02-nuova-tessera.png)

![Nuovo abbonamento](img/tessere-03-nuovo-abbonamento.png)

### In cassa

Il cliente crea la tessera dal telefono ([1.7](#17-tessere-prepagate-e-abbonamenti)); in cassa la si legge con lo
Scanner come una carta. Una tessera nuova è **Da attivare**: la si attiva solo dopo aver ricevuto il pagamento, con
una conferma che resta nel registro.

![Tessera da attivare](img/tessere-04-carnet-da-attivare.png)

![Conferma del pagamento](img/tessere-05-conferma-pagamento.png)

A ogni visita si scalano gli utilizzi (per 5 minuti si può annullare l'ultimo) e a fine tessera si ricarica.
L'abbonamento mostra il vantaggio e la scadenza, con **Rinnova**.

![Carnet scalato](img/tessere-06-carnet-scalato.png)

![Abbonamento valido](img/tessere-07-abbonamento-valido.png)

---

## 6. Carta a punti

Un negozio usa i timbri **oppure** i punti. Con i punti, in cassa si scrive l'importo dello scontrino: l'app mostra
subito quanti punti darà, poi **Dai N punti**. Superata la soglia il cliente sale di livello (Silver, Gold, Platinum,
ognuno con il suo vantaggio). Anche qui ci sono 5 minuti per annullare.

![Scheda a punti](img/punti-01-scheda.png)

![Importo dello scontrino](img/punti-02-importo.png)

![Nuovo livello](img/punti-03-nuovo-livello.png)

Nella sezione **Carta** si scelgono i punti per euro, la spesa minima e i livelli; nella scheda del cliente c'è lo
storico degli scontrini.

![Impostazioni dei punti](img/punti-04-impostazioni.png)

![Cliente a punti](img/punti-05-dettaglio-cliente.png)
