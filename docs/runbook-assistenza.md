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
pnpm diag enable --customer <id carta> --reason "…" --by <chi>
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
