# Brief per Claude Code — Loyalty Wallet

## Obiettivo
Completare e portare in produzione una **carta fedeltà digitale a timbri** per piccoli negozi (primo cliente: un parrucchiere, "ogni 10 tagli uno gratis"). Il prodotto è **multi-tenant** e verrà rivenduto in abbonamento a barbieri, estetiste, bar e pizzerie.

Il sistema ha tre parti:

| Parte | Chi la usa | Tecnologia |
| --- | --- | --- |
| **Backend + API** | tutti | Next.js 16 (route handler) + Supabase; hosting da scegliere (Cloudflare Workers o Vercel Pro) |
| **Web pubblico** | cliente finale | Next.js: solo iscrizione e aggiunta della carta al Wallet |
| **App esercente** | titolare e staff del negozio | **iOS + Android + Web** da un'unica codebase (Expo / React Native + React Native Web) |

### Vincoli di prodotto (non negoziabili)
- Il **cliente finale non ha account, login né area personale**. Interagisce solo con:
  1. la pagina web di iscrizione (raggiunta dal QR al bancone);
  2. la carta nel suo Google Wallet / Apple Wallet.
- **Tutte** le funzioni operative e gestionali (timbri, riscatti, dashboard, clienti, impostazioni carta, staff) stanno nell'**app esercente**, disponibile come app iOS, app Android e **web app** (da browser, es. PC o tablet in cassa). Stesse funzioni e stesso account su tutte e tre.
- Oltre a iscrizione e app esercente esiste solo un **pannello interno minimo** per noi (creazione negozi e abbonamenti), non esposto agli esercenti.

## Punto di partenza
Esiste uno scheletro funzionante in `loyalty-wallet/`. Leggi prima `README.md` e il codice: **estendi, non riscrivere**.

- `supabase/schema.sql`: `shops`, `customers`, `staff`, `stamp_events`, `apple_registrations`. RLS attiva senza policy (accesso solo server con service role). Funzioni atomiche `add_stamp` e `redeem_reward`.
- `src/lib/loyalty.ts`: dominio (iscrizione, timbri, riscatti).
- `src/lib/wallet/notifier.ts`: **unico** punto in cui il dominio parla con i wallet.
- `src/lib/wallet/google.ts`: LoyaltyClass/Object, JWT "Salva in Google Wallet", PATCH, notifiche.
- `src/lib/wallet/apple.ts`: `pass.json` storeCard pronto; firma e web service mancanti.
- `src/app/api/staff/*`: API già autenticate con bearer token Supabase: diventano la base delle API dell'app.
- `src/app/staff/` è un **prototipo PWA** da rimuovere quando l'app esercente copre scanner e timbri.

## Struttura del repository
Trasforma il progetto in un **monorepo** (pnpm workspaces o Turborepo):

```
apps/
  web/          Next.js: API + pagine pubbliche di iscrizione + pannello interno
  merchant/     Expo (React Native, TypeScript): app esercente iOS + Android + Web
packages/
  shared/       tipi, schemi zod delle API, costanti (riusati da web e merchant)
supabase/
  migrations/
```

## Regole
- Lingua delle interfacce: **italiano**.
- Nessun segreto nei client (web pubblico e app esercente su tutte le piattaforme). Service role key, chiave del service account Google e certificati Apple solo nel backend.
- L'app esercente parla **solo con le API del backend**, mai direttamente con le tabelle Supabase. Usa Supabase Auth solo per login e token.
- Ogni modifica a timbri/premi passa da una funzione Postgres atomica e da `notifyCardChanged`. Un errore di un wallet non annulla mai il timbro.
- Il QR della carta contiene solo `qr_token` (casuale). Mai id interni o dati personali in QR o URL.
- Contratti delle API definiti con zod in `packages/shared` e validati su entrambi i lati.
- Ogni fase termina con typecheck, lint e build puliti (web e app). Test Vitest per dominio e builder dei pass; test delle API sui permessi tra negozi.
- La UI segue il design consegnato da Claude Design (vedi `brief-claude-design.md`). Il tema per negozio (colore + logo) arriva da una sola sorgente.
- **Ogni funzionalità nasce già con i suoi log** secondo la sezione "Logging e diagnostica": una feature senza log adeguati non è considerata finita.

## Logging e diagnostica (requisito trasversale)
Obiettivo: quando un esercente chiama l'assistenza ("il timbro non è arrivato", "la carta non si aggiorna", "l'app dà errore"), dobbiamo ricostruire **esattamente cosa è successo in meno di un minuto**, senza chiedere all'esercente di riprodurre il problema.

### 0. Chiarezza prima di tutto (requisito principale)
Un log è utile solo se chi fa assistenza lo capisce **al primo colpo**, senza aprire il codice. Ogni riga deve rispondere a: **chi** ha fatto **cosa**, su **quale** negozio/carta, **con che esito** e, se è fallito, **perché** e **cosa fare**.

**Regole di scrittura**
- **Catalogo degli eventi** unico in `packages/shared/logging/events.ts`: ogni evento ha un nome stabile `dominio.oggetto.azione[.esito]` (es. `stamp.add.ok`, `stamp.add.rejected_cooldown`, `wallet.google.patch.failed`, `enroll.otp.sent`, `auth.login.failed`). Vietato loggare eventi non presenti nel catalogo (controllo di tipo TypeScript).
- Ogni riga ha un campo **`msg` in italiano**, una frase completa e autosufficiente, con i valori concreti. No messaggi generici come "error", "failed", "something went wrong", "ok".
- I dati restano **anche** in campi strutturati separati (per filtrare), il `msg` serve per leggere.
- **Catalogo degli errori** in `packages/shared/errors.ts`: ogni errore ha codice stabile (es. `E_STAMP_COOLDOWN`, `E_QR_OTHER_SHOP`, `E_GOOGLE_AUTH`, `E_APPLE_CERT_EXPIRED`), descrizione in italiano, **causa probabile** e **azione consigliata** per l'assistenza. Il codice compare nel log, nella risposta API e (in forma comprensibile) nell'app.
- Un errore si logga **una sola volta**, nel punto in cui si gestisce, con tutto il contesto. Niente catene di errori duplicati.
- Durate in `ms`, importi e conteggi come numeri, date in ISO 8601 UTC (la vista assistenza le mostra in ora italiana).
- Nomi dei campi identici ovunque (backend, app, web, Sentry): stesso `shop_id`, stesso `request_id`, stesso `customer_ref`.

**Esempi di righe attese** (formato JSON; `msg` è quello che si legge)

```json
{"ts":"2026-11-03T09:32:14.512Z","level":"info","event":"stamp.add.ok","request_id":"01JB7K3QX…","shop":"salone-mario","user":"giulia@…","role":"operator","platform":"ios","app_version":"1.4.0","customer_ref":"A3F2C91B","stamps_before":6,"stamps_after":7,"duration_ms":182,"msg":"Giulia (operatore, iOS 1.4.0) ha aggiunto un timbro alla carta A3F2C91B del Salone Mario: 6 → 7 su 10."}
{"ts":"2026-11-03T09:32:14.861Z","level":"info","event":"wallet.google.patch.ok","request_id":"01JB7K3QX…","customer_ref":"A3F2C91B","http_status":200,"duration_ms":341,"msg":"Carta A3F2C91B aggiornata su Google Wallet (7/10, 0 premi) in 341 ms."}
{"ts":"2026-11-03T09:40:02.007Z","level":"warn","event":"stamp.add.rejected_cooldown","error_code":"E_STAMP_COOLDOWN","request_id":"01JB7KJ2…","customer_ref":"A3F2C91B","last_stamp_at":"2026-11-03T09:32:14Z","cooldown_min":60,"msg":"Timbro rifiutato sulla carta A3F2C91B: ultimo timbro 8 minuti fa, il negozio richiede almeno 60 minuti tra due timbri."}
{"ts":"2026-11-03T10:05:44.120Z","level":"error","event":"wallet.google.patch.failed","error_code":"E_GOOGLE_AUTH","request_id":"01JB7N0A…","customer_ref":"B71D0E44","http_status":401,"attempt":1,"provider_response":"Request had invalid authentication credentials…","msg":"Aggiornamento su Google Wallet fallito per la carta B71D0E44: credenziali del service account rifiutate (401). Il timbro è salvato; verrà ritentato tra 5 minuti. Azione: verificare la chiave GOOGLE_WALLET_SA_KEY_B64."}
```

**Vista leggibile**
- In sviluppo i log si stampano in formato leggibile (`pino-pretty` o equivalente); in produzione restano JSON.
- La **timeline della vista Assistenza** mostra solo `ora locale · icona livello · msg`, con i campi strutturati espandibili al clic, e raggruppa le righe con lo stesso `request_id` in un unico blocco ("Timbro da Giulia alle 10:32 → DB ok → Google ok 341 ms → Apple: 2 dispositivi notificati").
- Gli errori nella timeline mostrano descrizione, causa probabile e azione consigliata presi dal catalogo degli errori.
- `docs/runbook-assistenza.md` è generato in parte dai due cataloghi (eventi ed errori), così la documentazione non diverge dal codice.

**Verifica**
- Test che ogni evento del catalogo abbia `msg` costruito da un template con tutti i segnaposto valorizzati (nessun `undefined` o `[object Object]` nei messaggi).
- Revisione dei log come parte di ogni fase: per ogni nuovo flusso si allegano al riepilogo le righe di log prodotte in un caso riuscito e in un caso di errore, e devono essere comprensibili senza leggere il codice.

### 1. Correlazione end-to-end
- Ogni richiesta ha un **`request_id`** (ULID). Lo generano l'app e il web, lo inviano nell'header `X-Request-Id`; il backend lo riusa o lo crea, lo restituisce nella risposta e lo propaga a log, eventi di dominio, chiamate a Google/Apple/Twilio e job di retry.
- Ogni errore mostrato all'utente (app esercente e web di iscrizione) include un **codice assistenza breve** derivato dal `request_id` (es. `ERR-7K3QX`), copiabile con un tocco. Cercando quel codice si trova tutta la catena.

### 2. Log tecnici strutturati (backend)
- Logger JSON (`pino` o equivalente compatibile con l'hosting) in `packages/shared/logger`, mai `console.log` sparsi.
- Campi standard su ogni riga: `ts`, `level`, `request_id`, `route`, `method`, `status`, `duration_ms`, `shop_id`, `user_id` (staff), `role`, `platform` (`ios` | `android` | `web` | `public-web`), `app_version`, `build`, `customer_ref` (id interno o codice breve, **mai telefono in chiaro**), `event`, `error.code`, `error.message`, `error.stack`.
- Livelli: `error`, `warn`, `info` (default in produzione), `debug`, `trace`.
- Cosa loggare sempre a `info`: ogni chiamata API (inizio/fine con esito e durata), login e logout, ogni timbro, annullamento, riscatto, rettifica, cancellazione cliente, cambio impostazioni, invio promozioni, iscrizioni e richieste OTP (esito, non il codice).
- **Chiamate esterne** (Google Wallet, APNs, Twilio, Stripe, Supabase Storage): endpoint, metodo, status HTTP, durata, tentativo n°, id dell'oggetto coinvolto; in caso di errore anche il body della risposta del provider (troncato a 4 KB).
- Web service Apple: loggare registrazioni/deregistrazioni dei dispositivi, download dei pass e quanto inviato dai dispositivi all'endpoint `/log`.

### 3. Modalità diagnostica attivabile
- Livello `debug`/`trace` attivabile **per singolo negozio, singolo utente staff o singolo cliente** dal pannello interno, con **scadenza automatica** (default 24 ore, max 7 giorni), senza deploy.
- In modalità diagnostica si registrano anche payload di richiesta/risposta delle API (già redatti, vedi punto 6) e i payload completi inviati a Google/Apple.
- Ogni attivazione/disattivazione è a sua volta tracciata (chi, quando, perché).

### 4. Audit di dominio (storico permanente)
Separato dai log tecnici e conservato più a lungo, nella tabella `audit_log` (append-only, nessun update/delete dall'app):
- `id`, `ts`, `request_id`, `shop_id`, `actor_type` (`staff` | `customer` | `system` | `support`), `actor_id`, `action` (`stamp`, `undo`, `redeem`, `adjust`, `customer_delete`, `settings_update`, `staff_invite`, `promo_send`, `enroll`, …), `entity`, `entity_id`, `before` e `after` (JSONB, es. timbri e premi prima e dopo), `reason`, `platform`, `app_version`, `ip_hash`.
- Scritto **nella stessa transazione** dell'operazione (dentro le funzioni Postgres come `add_stamp`), così non può esistere un timbro senza la sua traccia.
- `stamp_events` resta per le statistiche; l'assistenza usa `audit_log`.

### 5. Stato di sincronizzazione delle carte
- Tabella `wallet_sync_state` per ogni carta e wallet: ultimo stato inviato (timbri, premi), `last_success_at`, `last_error_at`, `last_error`, `attempts`, `request_id` dell'ultima sincronizzazione.
- Per Apple anche il numero di dispositivi registrati e l'ultimo download del pass.
- Così si risponde subito a "la carta del cliente non si aggiorna": si vede se l'abbiamo inviata, cosa ha risposto Google/Apple e quando il telefono l'ha scaricata.

### 6. Log lato client (app esercente iOS/Android/Web e web di iscrizione)
- **Sentry** (o equivalente) per crash ed errori JS, con `request_id`, utente staff, negozio, piattaforma, versione e breadcrumb di navigazione e chiamate API. Source map e simboli nativi caricati a ogni build EAS e deploy web.
- **Buffer locale** degli ultimi ~500 eventi dell'app (navigazione, scansioni, chiamate API con esito e durata, permessi fotocamera, stato rete), ruotato, senza dati personali.
- Pulsante **"Invia diagnostica all'assistenza"** nel profilo dell'app: carica buffer + info dispositivo (modello, OS, versione app, permessi, lingua, fuso orario, tipo di scanner usato) e mostra un **codice ticket** da comunicarci.
- Il web di iscrizione registra l'esito di ogni passo del funnel (form, OTP inviato, OTP verificato, carta creata, click su "Aggiungi al Wallet") per capire dove si bloccano i clienti.

### 7. Privacy e sicurezza dei log
- **Redazione automatica** nel logger e in Sentry, con test dedicati: mai in chiaro token, chiavi, header `Authorization`, codici OTP, password, JWT "Salva in Wallet", `qr_token` completo, `authenticationToken` Apple. Telefono sempre mascherato (`+39 333 ***4567`), nomi solo nell'audit di dominio.
- IP salvati solo come hash con salt.
- **Retention**: log tecnici 30 giorni, log di modalità diagnostica 7 giorni, crash client 90 giorni, `audit_log` 24 mesi (o fino alla cancellazione del negozio). Alla cancellazione di un cliente l'audit viene pseudonimizzato (id mantenuto, dati personali rimossi).
- Accesso ai log solo al nostro team, tracciato. Retention e finalità indicate nell'informativa privacy e nell'accordo di responsabile del trattamento con i negozi.

### 8. Dove finiscono i log
- Log tecnici verso un servizio esterno di log management con ricerca full-text e filtri per campo (es. Axiom, Better Stack o Grafana Cloud, partendo dal piano gratuito), tramite il meccanismo dell'hosting scelto (log drain/Logpush) o trasporto diretto. Il logger deve permettere di cambiare destinazione da configurazione.
- `audit_log`, `wallet_sync_state` e attivazioni della modalità diagnostica restano in Postgres.
- **Alert** (email o Telegram) su: tasso di errori 5xx sopra soglia, fallimenti ripetuti verso Google/Apple, coda `wallet_sync_failures` in crescita, certificato Apple in scadenza, credito Twilio basso.

### 9. Strumenti per l'assistenza (pannello interno)
Vista **Assistenza** nel pannello interno:
- ricerca per codice errore/`request_id`, codice ticket diagnostica, negozio, utente staff, codice breve della carta o telefono (cercato per hash);
- **timeline unificata** di un negozio o di un cliente: audit di dominio + log tecnici + sincronizzazioni wallet + crash client, in ordine cronologico;
- stato carta su Google e Apple a confronto con il DB, con pulsante **"Risincronizza carta"** (azione tracciata come `actor_type: support`);
- attivazione/disattivazione della modalità diagnostica.


## Come lavorare per fasi
- Le fasi vanno eseguite **una alla volta, in ordine**. Le dipendenze sono indicate in ogni fase.
- All'inizio di una fase: rileggi questo documento, verifica i prerequisiti e proponi un piano breve prima di scrivere codice.
- A fine fase **fermati** e consegna il riepilogo (vedi "Cosa consegnare a ogni fase"). Non iniziare la fase successiva senza conferma.
- Una fase è chiusa solo quando tutti i punti della sua **Definition of Done** sono soddisfatti, inclusi i log.
- Ogni fase ha una sezione **Log**: elenca gli eventi del catalogo da aggiungere. Nessun evento fuori catalogo, nessun `msg` generico.
- Se durante una fase emerge una decisione non coperta da questo documento, fermati e chiedi invece di scegliere da solo.

### Mappa delle fasi

| # | Fase | Dipende da | Rilascio |
| --- | --- | --- | --- |
| 0 | Preparazione repository e CI | — | interno |
| 1 | Fondamenta di logging e gestione errori | 0 | interno |
| 2 | Modello dati, dominio e audit | 1 | interno |
| 3 | API esercente v1 | 2 | interno |
| 4 | Google Wallet robusto e sincronizzazione | 2 | interno |
| 5 | Web pubblico di iscrizione con OTP | 3, 4 | interno |
| 6 | App esercente: fondamenta (iOS, Android, Web) | 3 | interno |
| 7 | App esercente: scanner e timbratura | 6 | interno |
| 8 | App esercente: area titolare | 7 | interno |
| 9 | Pannello interno e vista Assistenza | 2, 3 | interno |
| 10 | Pilota: deploy, monitoraggio, distribuzione di test | 5, 8, 9 | **MVP** con il primo negozio |
| 11 | Immagini dinamiche della carta | 10 | aggiornamento |
| 12 | Apple Wallet | 10 | aggiornamento |
| 13 | Billing e onboarding nuovi negozi | 10 | aggiornamento |
| 14 | Pubblicazione sugli store | 12, 13 | pubblico |

---

### Fase 0 — Preparazione repository e CI
**Obiettivo**: trasformare lo scheletro in un monorepo pulito, con qualità del codice verificata automaticamente a ogni push.

**Attività**
1. Monorepo pnpm workspaces (o Turborepo) con `apps/web`, `apps/merchant` (vuoto per ora), `packages/shared`, `supabase/`.
2. Spostare lo scheletro esistente in `apps/web` senza cambiarne il comportamento.
3. TypeScript strict condiviso (`tsconfig.base.json`), ESLint + Prettier condivisi, alias di import.
4. Vitest configurato in `packages/shared` e `apps/web`.
5. Supabase CLI: convertire `schema.sql` nella prima migrazione in `supabase/migrations/`; script per avviare Supabase in locale e applicare le migrazioni; `seed.sql` con un negozio e un utente staff di prova.
6. GitHub Actions: install, typecheck, lint, test, build su ogni push e pull request.
7. `.env.example` unico e documentato per ogni app; validazione delle variabili all'avvio con zod (messaggio chiaro se ne manca una).
8. README aggiornato: avvio locale in meno di 10 minuti.

**Log**: nessun evento di dominio; all'avvio una riga che riepiloga ambiente, versione e configurazione caricata (senza segreti).

**Test**: lo scheletro esistente continua a funzionare (iscrizione e timbro in locale).

**Definition of Done**
- `pnpm i && pnpm dev` avvia web e Supabase locale con dati di prova.
- La CI è verde su un push di prova.
- Nessun segreto nel repository (controllo con `gitleaks` o equivalente in CI).

---

### Fase 1 — Fondamenta di logging e gestione errori
**Obiettivo**: costruire **prima di tutto il resto** l'infrastruttura descritta in "Logging e diagnostica", così ogni fase successiva la usa da subito.

**Attività**
1. `packages/shared/logging/events.ts`: catalogo degli eventi tipizzato. Ogni evento definisce nome, livello di default, campi obbligatori e **template del `msg` in italiano**.
2. `packages/shared/errors.ts`: catalogo degli errori con codice, status HTTP, messaggio per l'utente, descrizione, causa probabile e azione consigliata per l'assistenza.
3. Logger condiviso (`pino` o equivalente compatibile con l'hosting scelto) con:
   - campi standard (punto 2 della sezione logging);
   - API tipizzata: `log.event('stamp.add.ok', {...})` accetta solo eventi del catalogo con i campi richiesti;
   - redazione automatica (punto 7) e mascheramento del telefono;
   - output leggibile in sviluppo, JSON in produzione.
4. Middleware per i route handler: crea o riusa `request_id` da `X-Request-Id`, lo restituisce in risposta, misura la durata, logga inizio e fine richiesta, cattura le eccezioni e le converte in risposte d'errore standard `{ error: { code, message, support_code } }`.
5. `support_code` breve derivato dal `request_id` (es. `ERR-7K3QX`) e funzione inversa per la ricerca.
6. Wrapper per le chiamate HTTP esterne (`fetchExternal`) che logga provider, endpoint, status, durata, tentativo e, in errore, il body troncato.
7. Tabella `diagnostic_modes` (scope negozio/utente/cliente, livello, scadenza, motivo, chi l'ha attivata) e lettura con cache breve nel logger.
8. Trasporto verso il servizio di log esterno configurabile da variabile d'ambiente (disattivabile in locale).
9. Generatore di `docs/runbook-assistenza.md` (sezione eventi ed errori) a partire dai due cataloghi, eseguito in CI.

**Log**: eventi `http.request.start`, `http.request.end`, `http.request.failed`, `external.call.ok`, `external.call.failed`, `diagnostic.mode.enabled`, `diagnostic.mode.expired`.

**Test**
- Ogni evento del catalogo genera un `msg` senza `undefined`, `null` o `[object Object]` (test generato per tutti gli eventi con dati di esempio).
- Redazione: token, header `Authorization`, OTP, password, JWT, `qr_token` e telefono non compaiono mai in chiaro.
- Un errore non gestito produce una sola riga `error` con stack, `request_id` e `support_code`, e una risposta 500 standard.
- La modalità diagnostica attiva `debug` solo nello scope indicato e scade da sola.

**Definition of Done**
- Gli endpoint esistenti dello scheletro usano già middleware, logger ed errori standard.
- Allegate al riepilogo le righe di log di una richiesta riuscita e di una fallita, leggibili senza aprire il codice.

---

### Fase 2 — Modello dati, dominio e audit
**Obiettivo**: completare il modello dati multi-tenant con tutte le regole di business, ognuna atomica e tracciata.

**Attività**
1. Migrazioni:
   - `staff.role` (`owner` | `operator`);
   - `shops`: `stamp_cooldown_minutes` (default 60), `status` (`active` | `suspended`), dati del titolare per l'informativa (ragione sociale, P.IVA, email privacy);
   - `customers`: `short_code` (8 caratteri leggibili, univoco per negozio, stampato sotto il QR), `deleted_at` per la cancellazione;
   - `audit_log` append-only (punto 4 della sezione logging), con trigger che impedisce update e delete;
   - `wallet_sync_state` e `wallet_sync_failures`.
2. Funzioni Postgres atomiche, ciascuna scrive anche in `audit_log` nella stessa transazione:
   - `add_stamp` con controllo cooldown (errore `E_STAMP_COOLDOWN` con minuti mancanti);
   - `undo_last_stamp` (entro 5 minuti, solo stesso operatore, solo se il timbro non ha sbloccato un premio già riscattato);
   - `redeem_reward`;
   - `adjust_balance` (solo titolare, motivo obbligatorio);
   - `delete_customer` (pseudonimizza l'audit, elimina i dati personali);
   - `set_marketing_consent`.
3. Parametri comuni delle funzioni: `request_id`, `actor_id`, `platform`, `app_version`, così l'audit è completo.
4. Aggiornare `src/lib/loyalty.ts` (dominio) per usare le nuove funzioni e mappare gli errori Postgres sugli errori del catalogo.
5. Indici per le query di assistenza e dashboard (audit per negozio/cliente/data, eventi per settimana).

**Log**: `stamp.add.ok`, `stamp.add.rejected_cooldown`, `stamp.undo.ok`, `stamp.undo.rejected`, `reward.unlocked`, `reward.redeem.ok`, `reward.redeem.rejected_none`, `balance.adjust.ok`, `customer.delete.ok`, `customer.marketing.changed`.

**Test**
- Concorrenza: 20 timbri paralleli sullo stesso cliente producono esattamente 20 incrementi, mai doppi né persi.
- Cooldown, annullamento fuori tempo o da altro operatore, riscatto senza premi: errore corretto e nessuna riga di audit.
- Ogni operazione riuscita ha la sua riga di audit con `before`/`after` coerenti.
- `audit_log` non è modificabile né cancellabile (test che il trigger blocchi).

**Definition of Done**
- Tutte le regole di business sono nel database o nel dominio, nessuna nelle route.
- Righe di log e di audit di esempio allegate per timbro, cooldown, premio sbloccato, riscatto e annullamento.

---

### Fase 3 — API esercente v1
**Obiettivo**: tutte le API che serviranno all'app esercente, documentate, sicure e testate prima di scrivere l'app.

**Attività**
1. Contratti zod in `packages/shared/api/` per ogni endpoint (richiesta e risposta), riusati da backend e app.
2. Middleware di autenticazione: bearer token Supabase, verifica appartenenza al negozio e ruolo; errori `E_AUTH_REQUIRED`, `E_AUTH_INVALID`, `E_FORBIDDEN_SHOP`, `E_FORBIDDEN_ROLE`.
3. Endpoint sotto `/api/v1/merchant/*`:
   - `GET me`, `GET shops`;
   - `POST scan/lookup` (accetta QR o codice breve), `POST stamp`, `POST undo`, `POST redeem`;
   - `GET stats` (titolare);
   - `GET customers`, `GET customers/:id` (con storico), `POST customers/:id/adjust`, `DELETE customers/:id`, `POST customers/:id/marketing`;
   - `GET/PUT shop-settings`, `POST shop-settings/logo-upload-url`;
   - `GET staff`, `POST staff/invite`, `PATCH staff/:id`, `DELETE staff/:id`;
   - `POST promotions` (solo prenotazione dell'invio; l'invio reale arriva in Fase 4);
   - `GET counter-qr.pdf`;
   - `POST diagnostics` (riceve il pacchetto "Invia diagnostica" dall'app, restituisce il codice ticket).
4. Rate limit per utente e per IP (Upstash Redis o firewall dell'hosting), errore `E_RATE_LIMITED`.
5. CORS limitato al dominio della web app esercente.
6. Documentazione OpenAPI generata dagli schemi zod, pubblicata in `/api/v1/docs` solo in sviluppo.
7. Rimozione delle vecchie route `/api/staff/*` e del prototipo PWA `/staff` (sostituiti dall'app).

**Log**: `auth.token.invalid`, `auth.forbidden.shop`, `auth.forbidden.role`, `ratelimit.hit`, `customer.lookup.ok`, `customer.lookup.not_found`, `customer.lookup.other_shop`, `settings.update.ok`, `staff.invite.sent`, `staff.role.changed`, `staff.revoked`, `diagnostics.received`.

**Test**
- Matrice dei permessi automatica: per ogni endpoint, operatore vs titolare vs utente di un altro negozio vs token assente/scaduto.
- Un operatore del negozio A non può leggere, timbrare né cercare clienti del negozio B, nemmeno con un QR valido di B.
- Validazione: input malformati restituiscono `E_VALIDATION` con il campo errato.

**Definition of Done**
- Collection di richieste di esempio (Bruno o file `.http`) per ogni endpoint, eseguibile in locale.
- Tutti gli endpoint usano contratti condivisi, middleware ed errori del catalogo.

---

### Fase 4 — Google Wallet robusto e sincronizzazione
**Obiettivo**: le carte Google sono sempre allineate al database e ogni problema di sincronizzazione è visibile e recuperabile.

**Attività**
1. `notifyCardChanged` aggiorna `wallet_sync_state` a ogni tentativo (successo o errore, con `request_id`).
2. In caso di errore: riga in `wallet_sync_failures`, retry con backoff esponenziale tramite cron (es. 1, 5, 15, 60 minuti, poi alert).
3. Sincronizzazione idempotente: si invia sempre lo stato completo della carta, mai incrementi.
4. Disattivazione carta (`state: INACTIVE`) su cancellazione cliente e sospensione negozio; riattivazione alla riattivazione del negozio.
5. Aggiornamento della LoyaltyClass al cambio di impostazioni del negozio.
6. Invio promozioni (`addMessage`) in coda, con rispetto del consenso marketing, limite settimanale e link firmato di disiscrizione.
7. Funzione "risincronizza carta" e "risincronizza negozio" richiamabili dal pannello interno.
8. Mappatura degli errori Google sul catalogo (`E_GOOGLE_AUTH`, `E_GOOGLE_NOT_FOUND`, `E_GOOGLE_QUOTA`, `E_GOOGLE_INVALID_PAYLOAD`).

**Log**: `wallet.google.class.upsert.ok/failed`, `wallet.google.object.upsert.ok/failed`, `wallet.google.patch.ok/failed`, `wallet.google.message.sent/failed`, `wallet.sync.retry.scheduled`, `wallet.sync.retry.exhausted`, `wallet.card.deactivated`, `promo.send.queued`, `promo.send.completed`.

**Test**
- Con API Google simulata: errore 401 → timbro salvato, stato di sync in errore, retry pianificato; al ripristino la carta si riallinea.
- Promozione inviata solo ai clienti con consenso, una volta sola anche in caso di retry.

**Definition of Done**
- Dalla tabella `wallet_sync_state` si capisce per ogni carta se è allineata e, se no, perché.
- Log di esempio allegati per sync riuscita, errore con retry e retry esauriti.

---

### Fase 5 — Web pubblico di iscrizione con OTP
**Obiettivo**: il flusso completo del cliente finale, l'unica sua interfaccia oltre alla carta.

**Attività**
1. `/<slug>`: form nome + telefono (normalizzato E.164, default +39), consenso privacy obbligatorio, consenso marketing facoltativo; negozio sospeso o inesistente → pagina dedicata.
2. OTP via Supabase Phone Auth con Twilio Verify: captcha Cloudflare Turnstile prima dell'invio, invio solo verso l'Italia, limite per numero e per IP, reinvio dopo 60 secondi, massimo 5 tentativi di verifica. La sessione Supabase creata dall'OTP viene chiusa subito dopo l'iscrizione.
3. Cliente nuovo → crea cliente e carta Google; cliente esistente → stessa carta, timbri conservati.
4. Pagina finale con il pulsante Wallet giusto per il dispositivo (Google su Android; Apple predisposto per la Fase 12; su desktop QR per aprire dal telefono).
5. `/<slug>/qr`: cartello A5 stampabile e PDF scaricabile.
6. `/<slug>/privacy`: informativa generata da template con i dati del titolare.
7. `/u/<token>`: disiscrizione dalle promozioni tramite link firmato e monouso, senza login.
8. `request_id` generato anche nel web pubblico; errori mostrati con codice assistenza.
9. Design da Claude Design; Lighthouse mobile ≥ 90.

**Log** (eventi di funnel): `enroll.form.submitted`, `enroll.captcha.failed`, `enroll.otp.sent`, `enroll.otp.send_failed`, `enroll.otp.verified`, `enroll.otp.wrong_code`, `enroll.otp.too_many_attempts`, `enroll.customer.created`, `enroll.customer.returning`, `enroll.wallet.link.shown`, `enroll.wallet.link.clicked`, `marketing.unsubscribe.ok`.

**Test**
- End-to-end (Playwright) con OTP simulato: nuovo cliente, cliente di ritorno, codice errato, troppi tentativi, negozio sospeso.
- Nessun dato personale in URL, query string o log.

**Definition of Done**
- Da telefono Android reale: iscrizione completa e carta salvata in Google Wallet (Demo mode).
- Dal log del funnel si vede in quale passo si fermano i clienti.

---

### Fase 6 — App esercente: fondamenta (iOS, Android, Web)
**Obiettivo**: l'ossatura dell'app sulle tre piattaforme, con login, navigazione, tema e diagnostica già funzionanti.

**Attività**
1. Progetto Expo in `apps/merchant` con Expo Router e target `ios`, `android`, `web`; TypeScript strict; import da `packages/shared`.
2. Client API unico: aggiunge token, `X-Request-Id`, `platform`, `app_version`; valida le risposte con gli schemi zod; converte gli errori del catalogo in messaggi per l'utente con codice assistenza copiabile.
3. Autenticazione: login, recupero password, accettazione invito (deep link su mobile, link web sul browser), logout, refresh token. Archiviazione token: `expo-secure-store` su mobile, storage del browser su web.
4. Selezione negozio se l'utente ne ha più di uno; ruolo caricato da `GET me` e usato per mostrare/nascondere le sezioni.
5. Navigazione: operatore con solo scanner e profilo; titolare con tab bar su mobile e barra laterale su tablet orizzontale e desktop.
6. Design system da Claude Design: token, componenti base, modalità chiara e scura, accento con il colore del negozio.
7. Diagnostica client: Sentry su iOS, Android e web (source map e simboli caricati in CI/EAS), buffer locale degli ultimi ~500 eventi, schermata Profilo con versione, negozio, utente e pulsante **"Invia diagnostica all'assistenza"** che mostra il codice ticket.
8. Build EAS di sviluppo per iOS e Android; web app esportata e installabile come PWA.
9. Gestione stato rete: banner "Sei offline" e blocco delle azioni che richiedono il server.

**Log** (client, inviati a Sentry/buffer): `app.start`, `app.login.ok`, `app.login.failed`, `app.logout`, `app.shop.selected`, `app.api.error`, `app.offline`, `app.online`, `app.diagnostics.sent`.

**Test**
- Unit test del client API (errori, refresh token, `request_id`).
- Login e cambio negozio funzionanti su simulatore iOS, emulatore Android e browser.

**Definition of Done**
- La stessa utenza fa login su iOS, Android e web e vede lo stesso negozio.
- Un errore forzato mostra il codice assistenza e la riga corrispondente è trovabile nei log del backend.
- "Invia diagnostica" produce un ticket ricevuto dal backend.

---

### Fase 7 — App esercente: scanner e timbratura
**Obiettivo**: il flusso più usato in negozio, rapido e affidabile su ogni piattaforma.

**Attività**
1. Scanner nativo (`expo-camera`) a schermo pieno, lettura continua, torcia, richiesta e gestione del permesso fotocamera.
2. Scanner web: fotocamera del browser (`BarcodeDetector`, fallback `html5-qrcode`) **e** modalità lettore QR esterno (campo sempre a fuoco che riceve il codice seguito da Invio, senza clic tra un cliente e l'altro).
3. Inserimento manuale del codice breve.
4. Scheda cliente: nome, griglia timbri, premi; "+1 timbro", "Riscatta premio", "Annulla ultimo timbro" (visibile 5 minuti), "Cliente successivo".
5. Feedback: aptico su mobile, visivo e sonoro opzionale su web; schermata di premio sbloccato.
6. Protezione dai doppi tocchi: pulsante disabilitato durante la richiesta e chiave di idempotenza per ogni azione (il backend ignora la seconda richiesta con la stessa chiave).
7. Errori chiari: cooldown con minuti mancanti, QR di altro negozio, carta cancellata, rete assente.

**Log**: lato client `scan.read.ok`, `scan.read.invalid`, `scan.camera.denied`, `scan.mode.changed` (camera/lettore/manuale); lato server `stamp.add.duplicate_ignored` (idempotenza).

**Test**
- Test dei componenti (scheda cliente nei vari stati).
- Prova reale: 10 timbri e riscatto su iPhone, Android e web con webcam e con lettore USB.

**Definition of Done**
- Tempo da scansione a timbro confermato sotto i 2 secondi con buona rete.
- Doppio tocco rapido su "+1 timbro" produce un solo timbro.
- La timeline di una sessione di timbratura è leggibile nei log senza aprire il codice.

---

### Fase 8 — App esercente: area titolare
**Obiettivo**: tutte le funzioni di gestione del negozio, solo per il ruolo titolare.

**Attività**
1. **Dashboard**: iscritti totali, timbri e premi della settimana, grafico 8 settimane, clienti inattivi da più di 60 giorni.
2. **Clienti**: lista con ricerca per nome, telefono o codice breve, paginazione; dettaglio con griglia e storico; rettifica saldo con motivo; revoca consenso marketing; cancellazione con doppia conferma.
3. **Impostazioni carta**: logo (galleria/file, ritaglio quadrato, upload con URL firmato), colore, timbri necessari, testo premio, cooldown; anteprima live della carta Google e Apple; salvataggio che aggiorna la LoyaltyClass.
4. **Staff**: lista, invito, cambio ruolo, revoca (non si può revocare l'ultimo titolare).
5. **Promozioni**: testo, anteprima notifica, numero destinatari con consenso, limite settimanale, storico invii.
6. **Cartello QR**: anteprima, condivisione e stampa del PDF.
7. Layout desktop della web app per dashboard e clienti (più colonne, dettaglio affiancato).

**Log**: `stats.viewed`, `customer.search`, `balance.adjust.ok`, `customer.delete.ok`, `settings.update.ok`, `logo.upload.ok/failed`, `staff.invite.sent`, `promo.send.queued`, `counter_qr.downloaded`.

**Test**
- Un operatore non vede né raggiunge (anche via URL sul web) nessuna schermata del titolare.
- Cancellazione cliente: dati rimossi, audit pseudonimizzato, carta Google disattivata.

**Definition of Done**
- Cambio di colore e logo visibile sulla carta del telefono senza reinstallarla.
- Ogni azione del titolare compare nella timeline con `msg` comprensibile.

---

### Fase 9 — Pannello interno e vista Assistenza
**Obiettivo**: gli strumenti per gestire i negozi e fare assistenza, necessari già per il pilota.

**Attività**
1. Pannello web in `apps/web/(internal)`, accesso solo per il nostro team, login con 2FA, ogni azione tracciata in `audit_log` come `actor_type: support`.
2. **Negozi**: crea negozio, invita il titolare, sospendi/riattiva, dati per l'informativa.
3. **Assistenza** (punto 9 della sezione logging):
   - ricerca per codice errore, `request_id`, codice ticket, negozio, utente staff, codice breve carta, telefono (per hash);
   - timeline unificata con righe raggruppate per `request_id` e dettagli espandibili;
   - per gli errori: descrizione, causa probabile e azione consigliata dal catalogo;
   - stato carta Google/Apple confrontato con il DB e pulsante "Risincronizza";
   - attivazione della modalità diagnostica con scope, durata e motivo;
   - visualizzazione dei pacchetti "Invia diagnostica" ricevuti dalle app.
4. **GDPR**: cancellazione di un cliente su richiesta e esportazione dei suoi dati (JSON) da inviare all'interessato.

**Log**: `support.login`, `support.search`, `support.resync`, `support.diagnostic.enabled`, `support.customer.export`, `support.customer.delete`, `shop.created`, `shop.suspended`, `shop.reactivated`.

**Test**
- Accesso negato a chiunque non sia nel team interno.
- Prova "assistenza alla cieca": dato solo il codice errore di un problema simulato, una persona che non ha scritto il codice trova causa e azione in meno di un minuto.

**Definition of Done**
- Ogni tipo di problema simulato (credenziali Google errate, cooldown, QR di altro negozio, rete assente lato app) è diagnosticabile solo dalla vista Assistenza.

---

### Fase 10 — Pilota: deploy, monitoraggio, distribuzione di test (**MVP**)
**Obiettivo**: mettere in produzione per il primo negozio, con tutto sotto controllo.

**Attività**
1. Deploy del backend e del web pubblico sull'hosting scelto, dominio e HTTPS; web app esercente su `app.<dominio>`.
2. Supabase di produzione con backup giornalieri; migrazioni applicate da CI.
3. Ambienti separati sviluppo/produzione con variabili d'ambiente distinte.
4. Servizio di log esterno collegato, retention configurata (punto 7), alert attivi (punto 8) verso email o Telegram.
5. Build iOS su TestFlight e Android su test interno di Google Play; web app pubblicata.
6. Google Wallet: richiesta dell'accesso di pubblicazione (uscita dalla Demo mode) quando il flusso è stabile.
7. Primo negozio configurato dal pannello interno; cartello stampato.
8. `docs/runbook-assistenza.md` completo: problemi più probabili, eventi da cercare, azioni da fare.
9. Checklist di rilascio in `docs/release.md`.

**Log**: `deploy.started`, `deploy.completed` con versione e commit; verifica che tutti gli alert scattino in un test controllato.

**Definition of Done (accettazione MVP)**
- Un cliente Android si iscrive con OTP, salva la carta e **non ha nessun'altra interfaccia** oltre alla carta; lo stesso numero ritrova la stessa carta.
- Due operatori danno 10 timbri da dispositivi diversi; il cliente riceve la notifica del premio; il riscatto riporta a 0 timbri e 0 premi.
- Due scansioni contemporanee producono un solo timbro.
- Operatore e titolare vedono solo ciò che il loro ruolo consente; nessun accesso tra negozi.
- Il titolare cancella un cliente e la carta risulta disattivata; cambia logo e colore e la carta si aggiorna.
- Stessi dati e funzioni su iOS, Android e web, con timbratura da webcam e da lettore USB.
- Dato un codice errore, l'assistenza ricostruisce l'intera catena in meno di un minuto e capisce causa e azione dai soli messaggi.
- Nessun token, OTP, chiave o telefono in chiaro nei log e in Sentry.

---

### Fase 11 — Immagini dinamiche della carta
**Obiettivo**: la griglia dei timbri disegnata sulla carta, aggiornata a ogni timbro.

**Attività**
1. Endpoint `/api/v1/card-image/<slug>/<versione>/<n>.png` (n = 0…stamps_required, più stato premio) con `satori` / `@vercel/og`, secondo il design.
2. Versione nell'URL legata a logo, colore e numero di timbri: cambio impostazioni = nuove immagini, cache lunga sulle vecchie.
3. Google: impostare l'immagine dell'oggetto in base ai timbri (verificare nella documentazione Google Wallet il campo per immagine per singola carta; in alternativa `imageModulesData`).
4. Apple: stessa immagine come `strip.png` nelle tre risoluzioni (usata dalla Fase 12).

**Log**: `card_image.rendered` (con durata), `card_image.render_failed`, `card_image.cache_hit`.

**Definition of Done**: la carta mostra 0, 6 e 10 timbri e lo stato premio correttamente, con i due temi di prova del design.

---

### Fase 12 — Apple Wallet
**Obiettivo**: carte su iPhone con aggiornamento automatico. L'account Apple Developer serve comunque per l'app esercente, quindi è già disponibile.

**Attività**
1. Pass Type ID e certificato; certificati in variabili d'ambiente base64; alert 30 giorni prima della scadenza.
2. Generazione `.pkpass` con `passkit-generator` da `passJson()`, con icon, logo, strip della Fase 11 e retro con regolamento e contatto privacy.
3. Web service Apple sotto `/api/apple/v1/`: registrazione e deregistrazione dispositivi, `passesUpdatedSince`, download pass, endpoint `log`; `authenticationToken` per pass salvato solo come hash.
4. `notifyApple()`: push APNs vuota a tutti i dispositivi registrati, con aggiornamento di `wallet_sync_state` e retry come per Google.
5. Disattivazione pass su cancellazione cliente e sospensione negozio.
6. Pagina finale di iscrizione con "Aggiungi ad Apple Wallet" su iOS.

**Log**: `wallet.apple.pass.generated`, `wallet.apple.pass.downloaded`, `wallet.apple.device.registered`, `wallet.apple.device.unregistered`, `wallet.apple.push.ok/failed`, `wallet.apple.device_log` (messaggi inviati dai dispositivi), `wallet.apple.cert.expiring`.

**Test**: con iPhone reale, iscrizione, aggiunta, timbro con aggiornamento in pochi secondi e notifica del premio sulla lock screen.

**Definition of Done**: dalla vista Assistenza si vede per ogni carta Apple quanti dispositivi la hanno e quando l'hanno scaricata l'ultima volta.

---

### Fase 13 — Billing e onboarding nuovi negozi
**Obiettivo**: vendere e attivare nuovi negozi senza intervento manuale.

**Attività**
1. Stripe Billing: piani mensile e annuale per negozio, periodo di prova, fatture.
2. Gestione abbonamento **solo dalla web app** (o da link web): le app iOS/Android mostrano lo stato ma non vendono nulla.
3. Webhook Stripe: pagamento fallito → avviso al titolare; oltre il periodo di grazia → negozio sospeso (carte `INACTIVE`, app in sola lettura); pagamento ripreso → riattivazione automatica.
4. Onboarding self-service dalla web app: registrazione titolare, dati del negozio, logo e colori, anteprima carta, cartello QR.

**Log**: `billing.checkout.started`, `billing.subscription.active`, `billing.payment.failed`, `billing.grace.expired`, `shop.suspended`, `shop.reactivated`, `onboarding.step.completed`.

**Definition of Done**: un nuovo negozio si registra, paga, configura la carta e iscrive il primo cliente senza nostro intervento; ogni passaggio è nella timeline.

---

### Fase 14 — Pubblicazione sugli store
**Obiettivo**: app esercente pubblica su App Store e Google Play.

**Attività**
1. Schede store: testi in italiano, screenshot, icone, informativa privacy pubblica.
2. Etichette privacy Apple e modulo "Sicurezza dei dati" Google coerenti con i dati raccolti (inclusi Sentry e log).
3. Cancellazione dell'account esercente dall'app (richiesta dagli store per le app con account).
4. Account demo per la revisione degli store, con negozio e clienti di prova.
5. Aggiornamenti over-the-air (EAS Update) per le correzioni JS, con canali separati per test e produzione.

**Log**: `app.update.available`, `app.update.applied`, `account.delete.requested`.

**Definition of Done**: app approvate e scaricabili; versione e build visibili nei log e nella vista Assistenza.

---

## Cosa consegnare a ogni fase
- Riepilogo delle modifiche e delle decisioni prese.
- Migrazioni da eseguire e nuove variabili d'ambiente in `.env.example`.
- README aggiornato (avvio locale, build e pubblicazione delle app).
- **Esempi di log**: le righe prodotte da un caso riuscito e da un caso di errore per ogni nuovo flusso, comprensibili senza leggere il codice.
- `docs/runbook-assistenza.md` aggiornato: per ogni nuovo flusso, quali eventi cercare e come diagnosticare i problemi più probabili.
- Elenco di cosa resta aperto o rimandato.
