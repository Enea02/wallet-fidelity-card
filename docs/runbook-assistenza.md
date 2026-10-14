# Runbook assistenza

Come ricostruire cosa è successo partendo da una segnalazione, senza chiedere all'esercente di riprodurre il problema.
Le sezioni **Eventi di log** ed **Errori** in fondo sono generate dai cataloghi del codice (`pnpm runbook`): non
modificarle a mano. Il resto è scritto a mano e va aggiornato a ogni fase.

Dove sono i log: in produzione su **Axiom** (Vercel Log Drain), dataset del progetto web. In locale nel terminale di
`pnpm dev`. Gli orari nei campi `ts` sono UTC; nei `msg` le date sono già in ora italiana.

## L'esercente comunica un codice assistenza (`ERR-XXXXX`)

Ogni errore mostrato in app o sul web riporta un codice come `ERR-7K3QX`, ricavato dal `request_id` della richiesta.

1. Normalizzare il codice: maiuscole, `O` → `0`, `I`/`L` → `1` (le persone lo dettano male; la funzione
   `normalizeSupportCode` lo fa da sola).
2. Cercare nei log `support_code:"ERR-7K3QX"`: compare sulle righe `http.request.end` / `http.request.failed`.
   Da lì prendere il `request_id`.
3. Filtrare per quel `request_id`: si vede tutta la catena (inizio richiesta, chiamate esterne, esito, durata).
4. Leggere `error_code` e cercarlo nella sezione **Errori** qui sotto: dice causa probabile e cosa fare.

Se la riga con il `support_code` non si trova (es. errore prima che la richiesta arrivasse al server), il codice
corrisponde comunque a un istante preciso (finestra di 32 ms): i `request_id` compatibili negli ultimi 30 giorni
iniziano con uno di 3-4 prefissi calcolabili. Dalla Fase 9 la vista Assistenza fa questa ricerca da sola.

## Il server non parte / tutto risponde 500 dopo un deploy

1. Cercare `server.startup.failed`: il `msg` elenca le variabili mancanti o malformate.
2. Correggerle nel progetto Vercel confrontandole con `apps/web/.env.example` e rifare il deploy.
3. Verificare che compaia `server.startup.ok`: riepiloga ambiente, versione, commit e servizi attivi. Se un wallet
   risulta "disattivato" in produzione mancano le sue variabili.

## Errore imprevisto (`E_INTERNAL`, `E_DB`)

La riga `http.request.failed` contiene lo stack in `error.stack` (e la causa originale in `error.cause`).

- `E_DB`: il `msg` riporta il messaggio di Postgres (tabella, vincolo). Verificare che le migrazioni siano applicate
  e lo stato di Supabase.
- `E_INTERNAL`: è un bug. Aprire una segnalazione allo sviluppo con `request_id`, `msg` e stack.

## La carta del cliente non si aggiorna sul telefono

1. Cercare per `customer_ref` (oggi l'id della carta) le righe `wallet.update.failed`: indicano wallet e motivo.
   Il timbro è comunque salvato nel database.
2. Errori di credenziali (401/403) → controllare `GOOGLE_WALLET_SA_KEY_B64` e i permessi del service account nella
   Google Pay & Wallet Console.
3. Dalla Fase 4: stato di sincronizzazione per carta (`wallet_sync_state`), retry automatici e pulsante
   "Risincronizza".

## "Il timbro non è arrivato" / "il saldo è sbagliato"

1. Trovare la carta: il codice breve (8 caratteri, es. `A3F2C91B`) è stampato sotto il QR nel Wallet del cliente
   ed è il `customer_ref` di tutte le righe di log.
2. Nei log, filtrare per `customer_ref`: `stamp.add.ok`, `reward.redeem.ok`, `stamp.undo.ok`, `balance.adjust.ok` dicono
   chi (nome dello staff, ruolo, piattaforma), quando e il saldo prima → dopo.
3. Lo storico permanente (24 mesi) è nella tabella `audit_log`: `entity_id` = id della carta, con `before`/`after`,
   `actor_id`, `request_id`, `platform`, `app_version`. Si può incrociare con i log tramite `request_id`.
4. Casi tipici:
   - `stamp.add.rejected_cooldown`: timbro rifiutato perché troppo vicino al precedente (tempo minimo del negozio,
     default 60 minuti). Normale per le doppie scansioni; altrimenti il titolare può rettificare o ridurre il tempo.
   - `stamp.undo.ok`: l'operatore ha annullato il timbro entro 5 minuti; se aveva completato la carta, il premio è
     stato tolto.
   - `balance.adjust.ok`: rettifica manuale del titolare, con il motivo.

## Annullamento dell'ultimo timbro rifiutato

Si annulla solo: entro 5 minuti, da chi ha dato il timbro, se dopo non ci sono state altre operazioni sulla carta e se
il premio eventualmente sbloccato non è già stato riscattato. Ogni rifiuto è una riga `stamp.undo.rejected` con il
motivo; la soluzione è sempre una rettifica del titolare con il motivo.

## Cliente cancellato

`customer.delete.ok`: nome, telefono e consensi rimossi, storico di audit pseudonimizzato (restano id, conteggi e date).
La carta nel Wallet del cliente non è più valida: scansionandola si ottiene `E_CARD_DELETED`. Il cliente può
reiscriversi con lo stesso numero e riceve una carta nuova. Da Fase 4 la carta Google viene anche disattivata.

## Servizio esterno lento o in errore

Le chiamate passate da `fetchExternal` producono `external.call.ok` / `external.call.failed` con provider,
endpoint, status HTTP, durata, tentativo e (in errore) la risposta del provider, già redatta e troncata a 4 KB.
`http_status` vuoto significa nessuna risposta (timeout o rete): controllare la pagina di stato del provider.

## Serve più dettaglio: modalità diagnostica

Per un problema che i log normali non spiegano, attivare la modalità diagnostica **solo** sullo scope interessato.
Registra anche i payload delle richieste e delle chiamate esterne (sempre redatti) e i log `debug`.

```bash
pnpm diag list
pnpm diag enable --shop <slug> --reason "<perché>" --by <chi> [--hours 24] [--level debug|trace]
pnpm diag enable --staff <email> --reason "…" --by <chi>
pnpm diag enable --customer <id carta> --reason "…" --by <chi>   # nei log la carta compare col codice breve
pnpm diag disable <id> --by <chi>
```

- Durata di default 24 ore, massimo 7 giorni (168 ore); scade da sola.
- I server la applicano entro 30 secondi.
- Attivazione, disattivazione e scadenza sono registrate (`diagnostic.mode.enabled` / `disabled` / `expired`) e
  restano nella tabella `diagnostic_modes` con chi, quando e perché.
- In produzione lo script va eseguito con le variabili dell'ambiente di produzione. Dalla Fase 9 si fa dal pannello
  interno.

## Cosa non c'è mai nei log

Token, header `Authorization`, cookie, password, OTP, JWT ("Salva in Wallet" compreso), chiavi, `qr_token` completo
(solo i primi 4 caratteri), telefono in chiaro (sempre `+39 333 ***4567`). Gli IP sono salvati solo come hash
(`ip_hash`). Se se ne trova uno, è un bug da segnalare subito.

<!-- INIZIO SEZIONE GENERATA: non modificare a mano, eseguire `pnpm runbook` -->

## Eventi di log

Ogni riga di log ha un campo `event` (uno di questi) e un `msg` da leggere.

### Avvio del server

| Evento | Livello | Quando compare | Esempio di `msg` |
| --- | --- | --- | --- |
| `server.startup.ok` | info | Il server è partito e la configurazione è valida. Riepiloga ambiente, versione e servizi attivi. | Server web avviato in ambiente production, versione 0.1.0 (commit a1b2c3d), Node 24.15.0: database Supabase su abcd.supabase.co, Google Wallet attivo, Apple Wallet disattivato, livello di log info. |
| `server.startup.failed` | error | Il server non è partito perché la configurazione non è valida. Elenca le variabili da correggere. | Avvio del server web (ambiente production, versione 0.1.0) bloccato: configurazione non valida. Variabili mancanti: SUPABASE_SERVICE_ROLE_KEY. Variabili con formato errato: APP_BASE_URL. Azione: impostarle confrontando apps/web/.env.example e riavviare. |

### Richieste API

| Evento | Livello | Quando compare | Esempio di `msg` |
| --- | --- | --- | --- |
| `http.request.start` | info | Una richiesta API è arrivata al server. Apre il blocco di righe con lo stesso request_id. | Richiesta POST /api/staff/stamp ricevuta da ios (app 1.4.0). |
| `http.request.end` | info | Una richiesta API è terminata. Livello info se riuscita, warn se rifiutata con un errore del catalogo (dati non validi, permessi, carta non trovata…). | POST /api/staff/stamp completata con 200 in 182 ms. |
| `http.request.failed` | error | Una richiesta API è fallita per un errore imprevisto (bug o database). La riga contiene lo stack; il cliente ha ricevuto un 500 con il codice assistenza. | POST /api/staff/stamp fallita con errore imprevisto dopo 95 ms: relation "customers" does not exist (E_DB, risposta 500, codice assistenza ERR-7K3QX). Azione: passare lo stack di questa riga allo sviluppo. |
| `http.request.payload` | debug | Solo in modalità diagnostica: body della richiesta o della risposta API, già redatto (niente token, telefono, OTP). | Payload della richiesta POST /api/staff/stamp (92 byte): vedi il campo body. |

### Chiamate a servizi esterni

| Evento | Livello | Quando compare | Esempio di `msg` |
| --- | --- | --- | --- |
| `external.call.ok` | info | Chiamata riuscita a un servizio esterno (Google Wallet, APNs, Twilio, Stripe, Storage…). | Chiamata a google riuscita: aggiornamento carta per 3388.cust-a3f2 (PATCH https://walletobjects.googleapis.com/walletobjects/v1/loyaltyObject/3388.cust-a3f2, 200, 341 ms, tentativo 1). |
| `external.call.failed` | error | Chiamata fallita a un servizio esterno: status HTTP e risposta del provider (troncata a 4 KB) dicono perché. | Chiamata a google fallita: aggiornamento carta per 3388.cust-b71d (PATCH https://walletobjects.googleapis.com/walletobjects/v1/loyaltyObject/3388.cust-b71d, status 401, 212 ms, tentativo 1). Il provider dice: "Request had invalid authentication credentials." (E_EXTERNAL_HTTP). |
| `external.call.payload` | debug | Solo in modalità diagnostica: payload completo inviato o ricevuto da un servizio esterno, redatto. | Payload della richiesta a google per aggiornamento carta (1.8 KB): vedi il campo body. |

### Modalità diagnostica

| Evento | Livello | Quando compare | Esempio di `msg` |
| --- | --- | --- | --- |
| `diagnostic.mode.enabled` | info | Qualcuno del team ha attivato la modalità diagnostica (log debug/trace con payload) per un negozio, un utente staff o un cliente. | Modalità diagnostica debug attivata da enea per negozio salone-mario fino al 04/11/2026 10:00 (ora italiana). Motivo: Il titolare segnala timbri che non arrivano sulla carta. |
| `diagnostic.mode.disabled` | info | La modalità diagnostica è stata spenta a mano prima della scadenza. | Modalità diagnostica per negozio salone-mario disattivata da enea prima della scadenza. Era attiva dal 03/11/2026 10:00 (ora italiana); motivo: Il titolare segnala timbri che non arrivano sulla carta. |
| `diagnostic.mode.expired` | info | La modalità diagnostica è scaduta da sola: da qui in poi i log tornano al livello normale. | Modalità diagnostica debug per negozio salone-mario scaduta il 04/11/2026 10:00 (ora italiana): i log tornano al livello normale. Era stata attivata da enea il 03/11/2026 10:00 (ora italiana); motivo: Il titolare segnala timbri che non arrivano sulla carta. |
| `diagnostic.mode.read_failed` | warn | Il server non è riuscito a leggere le modalità diagnostiche attive: i log restano al livello normale finché la lettura non riesce. | Lettura delle modalità diagnostiche fallita: fetch failed (Supabase non raggiungibile). I log restano al livello normale; nuovo tentativo tra 30 secondi. |

### enroll

| Evento | Livello | Quando compare | Esempio di `msg` |
| --- | --- | --- | --- |
| `enroll.customer.created` | info | Un nuovo cliente si è iscritto: carta creata con il suo codice breve. | Nuovo cliente iscritto al negozio Salone Mario da web pubblico: carta A3F2C91B creata (consenso marketing: sì). |
| `enroll.customer.returning` | info | Un cliente già iscritto ha rifatto l'iscrizione con lo stesso telefono: ritrova la stessa carta. | Cliente già iscritto al negozio Salone Mario ha ritrovato la sua carta A3F2C91B (6/10 timbri, premi disponibili: 0). |

### stamp

| Evento | Livello | Quando compare | Esempio di `msg` |
| --- | --- | --- | --- |
| `stamp.add.ok` | info | Un membro dello staff ha aggiunto un timbro a una carta. | Giulia (operatore, iOS 1.4.0) ha aggiunto un timbro alla carta A3F2C91B del negozio Salone Mario: 6 → 7 su 10. |
| `stamp.add.rejected_cooldown` | warn | Timbro rifiutato perché troppo vicino al precedente (tempo minimo tra due timbri impostato dal negozio). | Timbro di Giulia (operatore, iOS 1.4.0) rifiutato sulla carta A3F2C91B del negozio Salone Mario: ultimo timbro 8 minuti fa, il negozio richiede almeno 60 minuti tra due timbri (mancano 52 minuti). |
| `stamp.undo.ok` | info | Un membro dello staff ha annullato l'ultimo timbro che aveva dato (entro 5 minuti). | Giulia (operatore, iOS 1.4.0) ha annullato l'ultimo timbro della carta A3F2C91B del negozio Salone Mario: 7 → 6 su 10. |
| `stamp.undo.rejected` | warn | Annullamento dell'ultimo timbro rifiutato: tempo scaduto, altro operatore, carta già modificata. | Annullamento dell'ultimo timbro chiesto da Giulia (operatore, iOS 1.4.0) sulla carta A3F2C91B del negozio Salone Mario rifiutato: il timbro è stato dato 12 minuti fa (limite 5 minuti). |

### reward

| Evento | Livello | Quando compare | Esempio di `msg` |
| --- | --- | --- | --- |
| `reward.unlocked` | info | Una carta ha raggiunto i timbri richiesti: il premio è disponibile. | La carta A3F2C91B del negozio Salone Mario ha raggiunto 10 timbri: premio "Taglio gratis" sbloccato (premi disponibili: 1). |
| `reward.redeem.ok` | info | Un membro dello staff ha riscattato un premio dalla carta del cliente. | Giulia (operatore, iOS 1.4.0) ha riscattato il premio "Taglio gratis" dalla carta A3F2C91B del negozio Salone Mario (premi disponibili: 1 → 0). |
| `reward.redeem.rejected_none` | warn | Riscatto rifiutato perché la carta non ha premi disponibili. | Riscatto chiesto da Giulia (operatore, iOS 1.4.0) sulla carta A3F2C91B del negozio Salone Mario rifiutato: nessun premio disponibile (la carta ha 4/10 timbri). |

### balance

| Evento | Livello | Quando compare | Esempio di `msg` |
| --- | --- | --- | --- |
| `balance.adjust.ok` | info | Il titolare ha corretto a mano timbri e premi di una carta, indicando il motivo. | Mario (titolare, web) ha rettificato la carta A3F2C91B del negozio Salone Mario: timbri 3 → 5 su 10, premi 0 → 0. Motivo: timbri della carta cartacea. |

### customer

| Evento | Livello | Quando compare | Esempio di `msg` |
| --- | --- | --- | --- |
| `customer.delete.ok` | info | Cliente cancellato su richiesta: dati personali rimossi, storico pseudonimizzato, la carta non è più utilizzabile. | Mario (titolare, web) ha cancellato il cliente della carta A3F2C91B del negozio Salone Mario: nome, telefono e consensi rimossi, 7 righe di storico pseudonimizzate (la carta aveva 4 timbri e 0 premi). |
| `customer.marketing.changed` | info | Il consenso alle promozioni di un cliente è cambiato (dal titolare o dal cliente con il link). | Mario (titolare, web) ha revocato il consenso alle promozioni per la carta A3F2C91B del negozio Salone Mario. |

### Wallet (Google / Apple)

| Evento | Livello | Quando compare | Esempio di `msg` |
| --- | --- | --- | --- |
| `wallet.update.failed` | error | L'aggiornamento della carta su Google o Apple Wallet è fallito. Il timbro o il riscatto è comunque salvato nel database. | Aggiornamento della carta B71D0E44 su Google Wallet fallito: Request failed with status code 401. Il dato è salvato nel database ma la carta sul telefono non è allineata. Azione: verificare le credenziali del wallet e risincronizzare la carta. |

## Errori

Il codice (`error_code` nei log, `error.code` nelle risposte API) indica cosa è andato storto.

### `E_INTERNAL` (HTTP 500)

- **L'utente vede**: Si è verificato un errore imprevisto. Riprova; se succede ancora comunica il codice all'assistenza.
- **Cosa è successo**: Eccezione non prevista dal codice durante una richiesta.
- **Causa probabile**: Bug nel codice o dato inatteso nel database.
- **Cosa fare**: Cercare la riga http.request.failed con lo stesso request_id: contiene lo stack. Aprire una segnalazione per lo sviluppo con stack e request_id.

### `E_DB` (HTTP 500)

- **L'utente vede**: Il servizio non riesce a leggere o salvare i dati. Riprova tra poco.
- **Cosa è successo**: Il database (Supabase/Postgres) ha restituito un errore inatteso.
- **Causa probabile**: Supabase non raggiungibile o sovraccarico, migrazione non applicata, vincolo del database violato.
- **Cosa fare**: Controllare lo stato di Supabase (status.supabase.com) e che le migrazioni siano applicate; il messaggio dell'errore nel log indica tabella o vincolo.

### `E_VALIDATION` (HTTP 400)

- **L'utente vede**: Alcuni dati non sono validi. Controlla e riprova.
- **Cosa è successo**: La richiesta contiene dati mancanti o nel formato sbagliato.
- **Causa probabile**: Campo compilato male dall'utente, oppure app/pagina non aggiornata che invia un formato vecchio.
- **Cosa fare**: Il log indica il campo errato. Se è un'app, verificare che sia all'ultima versione.

### `E_AUTH_REQUIRED` (HTTP 401)

- **L'utente vede**: Devi accedere per continuare.
- **Cosa è successo**: Richiesta a un'API riservata allo staff senza token di accesso.
- **Causa probabile**: Sessione non ancora aperta o app che non invia il token.
- **Cosa fare**: Far rifare il login. Se si ripete subito dopo il login, raccogliere la diagnostica dell'app.

### `E_AUTH_INVALID` (HTTP 401)

- **L'utente vede**: La sessione è scaduta. Accedi di nuovo.
- **Cosa è successo**: Il token di accesso inviato non è valido o è scaduto.
- **Causa probabile**: Sessione scaduta, utente eliminato o password cambiata su un altro dispositivo.
- **Cosa fare**: Far rifare il login. Se l'utente è stato rimosso dallo staff è il comportamento atteso.

### `E_FORBIDDEN_SHOP` (HTTP 403)

- **L'utente vede**: Il tuo utente non è abilitato su questo negozio.
- **Cosa è successo**: Un utente autenticato ha chiesto un'operazione su un negozio a cui non è associato.
- **Causa probabile**: Utente staff non ancora aggiunto al negozio, oppure app che usa il negozio sbagliato.
- **Cosa fare**: Verificare nella tabella staff l'associazione utente-negozio (user_id e shop_id sono nel log).

### `E_ADMIN_UNAUTHORIZED` (HTTP 401)

- **L'utente vede**: Non autorizzato.
- **Cosa è successo**: Chiamata a un'API di amministrazione con token admin assente o errato.
- **Causa probabile**: ADMIN_SETUP_TOKEN sbagliato nello script o nella chiamata, oppure tentativo di accesso non nostro.
- **Cosa fare**: Usare il valore di ADMIN_SETUP_TOKEN dell'ambiente giusto. Se le richieste non sono nostre, ruotare il token.

### `E_SHOP_NOT_FOUND` (HTTP 404)

- **L'utente vede**: Negozio non trovato.
- **Cosa è successo**: Lo slug del negozio richiesto non esiste.
- **Causa probabile**: QR o link stampato con uno slug sbagliato, oppure negozio rinominato o eliminato.
- **Cosa fare**: Confrontare lo slug nel log con la tabella shops e ristampare il cartello se serve.

### `E_CARD_NOT_FOUND` (HTTP 404)

- **L'utente vede**: Carta non trovata per questo negozio.
- **Cosa è successo**: Il QR scansionato non corrisponde a nessuna carta del negozio dello staff.
- **Causa probabile**: QR di un altro negozio, carta di un cliente cancellato, oppure lettura del QR incompleta.
- **Cosa fare**: Far riscansionare. Se si ripete, cercare la carta per codice breve e verificare a quale negozio appartiene.

### `E_PRIVACY_CONSENT_REQUIRED` (HTTP 400)

- **L'utente vede**: Per ottenere la carta devi accettare l'informativa privacy.
- **Cosa è successo**: Iscrizione inviata senza il consenso privacy obbligatorio.
- **Causa probabile**: Casella non spuntata, oppure pagina di iscrizione vecchia in cache.
- **Cosa fare**: Nessuna azione: il cliente deve spuntare il consenso.

### `E_NO_REWARD` (HTTP 409)

- **L'utente vede**: Il cliente non ha premi da riscattare.
- **Cosa è successo**: Richiesta di riscatto su una carta con zero premi disponibili.
- **Causa probabile**: Premio già riscattato (anche da un altro operatore) o doppio tocco sul pulsante.
- **Cosa fare**: Controllare lo storico della carta: l'ultimo riscatto indica chi e quando.

### `E_STAMP_COOLDOWN` (HTTP 409)

- **L'utente vede**: Timbro già dato da poco a questa carta. Riprova più tardi.
- **Cosa è successo**: Timbro rifiutato perché dall'ultimo timbro della carta non è passato il tempo minimo impostato dal negozio.
- **Causa probabile**: Doppia scansione dello stesso cliente, oppure cliente che torna nello stesso giorno.
- **Cosa fare**: Normale se era una doppia scansione. Se il cliente ha davvero diritto al timbro, il titolare può rettificare il saldo o ridurre il tempo minimo nelle impostazioni.

### `E_UNDO_EXPIRED` (HTTP 409)

- **L'utente vede**: Il timbro si può annullare solo nei 5 minuti successivi.
- **Cosa è successo**: Annullamento rifiutato: l'ultimo timbro è stato dato più di 5 minuti fa.
- **Causa probabile**: Errore accorgersi tardi del timbro sbagliato.
- **Cosa fare**: Il titolare può correggere con una rettifica del saldo, indicando il motivo.

### `E_UNDO_OTHER_OPERATOR` (HTTP 403)

- **L'utente vede**: Puoi annullare solo un timbro che hai dato tu.
- **Cosa è successo**: Annullamento rifiutato: l'ultimo timbro della carta è stato dato da un altro operatore.
- **Causa probabile**: Due operatori sulla stessa carta, o dispositivo condiviso con utenti diversi.
- **Cosa fare**: Far annullare a chi ha dato il timbro (entro 5 minuti) oppure rettifica del titolare.

### `E_UNDO_NOT_LAST` (HTTP 409)

- **L'utente vede**: Dopo questo timbro la carta è già stata modificata: non si può più annullare.
- **Cosa è successo**: Annullamento rifiutato: dopo l'ultimo timbro c'è stata un'altra operazione (riscatto o rettifica).
- **Causa probabile**: Timbro seguito subito da un riscatto o da una rettifica.
- **Cosa fare**: Il titolare può correggere con una rettifica del saldo, indicando il motivo.

### `E_UNDO_REWARD_REDEEMED` (HTTP 409)

- **L'utente vede**: Questo timbro ha sbloccato un premio già riscattato: non si può annullare.
- **Cosa è successo**: Annullamento rifiutato: il timbro ha completato la carta e il premio è già stato riscattato.
- **Causa probabile**: Timbro dato per errore e premio consegnato subito dopo.
- **Cosa fare**: Valutare con il titolare una rettifica del saldo, indicando il motivo.

### `E_NOTHING_TO_UNDO` (HTTP 409)

- **L'utente vede**: Non ci sono timbri da annullare su questa carta.
- **Cosa è successo**: Annullamento chiesto su una carta senza timbri annullabili.
- **Causa probabile**: Doppio tocco su "Annulla" o timbro già annullato.
- **Cosa fare**: Nessuna azione: controllare lo storico della carta se il cliente contesta il saldo.

### `E_FORBIDDEN_ROLE` (HTTP 403)

- **L'utente vede**: Questa operazione è riservata al titolare del negozio.
- **Cosa è successo**: Un utente dello staff ha tentato un'operazione permessa solo al titolare (rettifica, cancellazione, consensi).
- **Causa probabile**: Operatore che usa una funzione del titolare, oppure ruolo assegnato in modo sbagliato.
- **Cosa fare**: Verificare il ruolo dell'utente nella tabella staff; se deve essere titolare, cambiarlo.

### `E_CARD_DELETED` (HTTP 410)

- **L'utente vede**: Questa carta è stata cancellata su richiesta del cliente.
- **Cosa è successo**: Operazione su una carta il cui cliente è stato cancellato (dati personali rimossi).
- **Causa probabile**: Il cliente mostra una carta vecchia ancora nel Wallet dopo la cancellazione.
- **Cosa fare**: Il cliente può iscriversi di nuovo dal QR del bancone: riceverà una carta nuova.

### `E_SHOP_SUSPENDED` (HTTP 403)

- **L'utente vede**: Il negozio è momentaneamente sospeso: timbri e premi non sono disponibili.
- **Cosa è successo**: Operazione su un negozio con stato sospeso.
- **Causa probabile**: Abbonamento non pagato o sospensione manuale dal pannello interno.
- **Cosa fare**: Verificare lo stato dell'abbonamento del negozio e riattivarlo se è tutto in regola.

### `E_EXTERNAL_UNAVAILABLE` (HTTP 502)

- **L'utente vede**: Un servizio esterno non risponde. Riprova tra qualche minuto.
- **Cosa è successo**: Una chiamata a un servizio esterno (Google, Apple, Twilio…) è fallita per timeout o errore di rete.
- **Causa probabile**: Disservizio del provider o problema di rete temporaneo.
- **Cosa fare**: Cercare la riga external.call.failed con lo stesso request_id: indica provider, endpoint e durata. Controllare la pagina di stato del provider.

### `E_EXTERNAL_HTTP` (HTTP 502)

- **L'utente vede**: Un servizio esterno ha rifiutato la richiesta. Riprova tra qualche minuto.
- **Cosa è successo**: Un servizio esterno ha risposto con un errore HTTP.
- **Causa probabile**: Credenziali scadute o revocate, quota superata, oppure dati inviati non validi per il provider.
- **Cosa fare**: Cercare la riga external.call.failed con lo stesso request_id: contiene status HTTP e risposta del provider.

### `E_CONFIG_INVALID` (HTTP 500)

- **L'utente vede**: Il servizio non è configurato correttamente. Riprova tra qualche minuto.
- **Cosa è successo**: Il server non si avvia perché una o più variabili d'ambiente mancano o hanno un formato non valido.
- **Causa probabile**: Variabile non impostata nel deploy o nel file .env.local, oppure copiata male (spazi, virgolette, base64 troncato).
- **Cosa fare**: Confrontare le variabili del deploy con .env.example dell'app indicata nel log; correggere quelle elencate e riavviare.

<!-- FINE SEZIONE GENERATA -->
