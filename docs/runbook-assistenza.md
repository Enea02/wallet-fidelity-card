# Runbook assistenza

Come ricostruire cosa è successo partendo da una segnalazione, senza chiedere all'esercente di riprodurre il problema.
Le sezioni **Eventi di log** ed **Errori** in fondo sono generate dai cataloghi del codice (`pnpm runbook`): non
modificarle a mano. Il resto è scritto a mano e va aggiornato a ogni fase.

Dove sono i log: nella **vista Assistenza** del pannello interno (`/interno`, ultimi 30 giorni: copia in Postgres,
tabella `log_events`), e in produzione anche su **Axiom** (Vercel Log Drain), dataset del progetto web. In locale nel
terminale di `pnpm dev`. Gli orari nei campi `ts` sono UTC; nel pannello e nei `msg` le date sono in ora italiana.

## Vista Assistenza: da dove partire

Pannello interno su `/interno` (solo il team, email + password + codice dell'app di autenticazione). Un solo campo di
ricerca riconosce da solo cosa si è scritto:

| Si scrive | Si apre |
| --- | --- |
| `ERR-7K3QX` (codice che l'esercente legge sullo schermo) | la richiesta: tutte le righe con lo stesso `request_id` |
| `DIAG-XXXXXXXX` (ticket di "Invia diagnostica") | il pacchetto: dispositivo ed eventi dell'app |
| `E_STAMP_COOLDOWN` (codice di errore del catalogo) | descrizione, causa e azione + le ultime richieste con quell'errore |
| codice della carta (`DEMA2345`) o telefono del cliente | la scheda del cliente (il telefono si cerca per hash, mai salvato in chiaro) |
| email dello staff | la scheda dell'utente: negozi e sue azioni |
| nome o indirizzo del negozio | la scheda del negozio |

Ogni timeline (negozio, cliente, richiesta, utente) mette insieme log tecnici, storico di dominio (`audit_log`,
righe "Storico: …") e righe dell'app dai pacchetti di diagnostica ("App: …"), raggruppati per richiesta: un blocco è
una richiesta, con il riassunto dei passi ("stamp add ok → risposta 200 → Google errore 401"). Gli errori del
catalogo mostrano subito **causa probabile** e **cosa fare**; un clic su una riga mostra tutti i campi.

Dalla scheda del cliente: carta su Google letta in diretta e confrontata con il database, **Risincronizza**,
esportazione GDPR, cancellazione, modalità diagnostica. Dalla scheda del negozio: staff, sospensione/riattivazione,
risincronizzazione di tutte le carte, dati per l'informativa, modalità diagnostica.

Ogni azione dell'assistenza resta nello storico (`audit_log`, `actor_type = support`, con chi e perché) e nei log
(`support.*`, `shop.*`); anche le ricerche e le timeline aperte sono tracciate (`support.search`,
`support.timeline.viewed`).

## L'esercente comunica un codice assistenza (`ERR-XXXXX`)

Ogni errore mostrato in app o sul web riporta un codice come `ERR-7K3QX`, ricavato dal `request_id` della richiesta.
**Nel pannello basta cercarlo** (vista Assistenza): apre la richiesta con causa e azione. A mano, sul servizio di log:

1. Normalizzare il codice: maiuscole, `O` → `0`, `I`/`L` → `1` (le persone lo dettano male; la funzione
   `normalizeSupportCode` lo fa da sola).
2. Cercare nei log `support_code:"ERR-7K3QX"`: compare sulle righe `http.request.end` / `http.request.failed`.
   Da lì prendere il `request_id`.
3. Filtrare per quel `request_id`: si vede tutta la catena (inizio richiesta, chiamate esterne, esito, durata).
4. Leggere `error_code` e cercarlo nella sezione **Errori** qui sotto: dice causa probabile e cosa fare.

Se la riga con il `support_code` non si trova (es. errore prima che la richiesta arrivasse al server), il codice
corrisponde comunque a un istante preciso (finestra di 32 ms): i `request_id` compatibili negli ultimi 30 giorni
iniziano con uno di 3-4 prefissi calcolabili: la vista Assistenza fa questa ricerca da sola. Se l'app non ha proprio
raggiunto il server (rete assente, `E_NETWORK`), il codice esiste solo sul telefono: chiedere all'esercente
"Profilo → Invia diagnostica all'assistenza"; poi lo stesso `ERR-…` si trova nel pacchetto.

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

Ogni carta ha una riga in `wallet_sync_state` (`wallet = google`): cosa abbiamo inviato (`synced_stamps`,
`synced_rewards`, `synced_state`, `synced_version`), quando (`last_success_at`) e l'ultimo errore (`last_error_code`,
`last_error`, `attempts` = errori consecutivi). Se i valori inviati coincidono con quelli del cliente nel database,
**Google ha la carta giusta**: il telefono si aggiorna da solo (a volte dopo qualche minuto, o riaprendo il Wallet).

1. Cercare nei log per `customer_ref` (codice breve) le righe `wallet.google.*`:
   - `wallet.google.patch.ok`: carta aggiornata, con saldo e durata;
   - `wallet.google.patch.failed`: motivo in chiaro (credenziali, quota, dati rifiutati, Google giù), quando si
     riprova e cosa fare. **Il timbro è comunque salvato.**
2. I tentativi automatici sono in `wallet_sync_failures`: dopo un errore si riprova tra 1, 5, 15 e 60 minuti
   (`wallet.sync.retry.scheduled`); al quinto errore `wallet.sync.retry.exhausted` e la carta resta indietro.
3. Dopo aver risolto la causa: `pnpm wallet:resync --shop <slug> --card <codice breve>` (o solo `--shop` per tutto il
   negozio). Dal pannello: scheda del cliente → "Risincronizza" (o scheda del negozio per tutte le carte).
4. Carte rimaste indietro senza errori (es. server riavviato durante l'aggiornamento): le riallinea da sola la
   riconciliazione del cron entro pochi minuti (`wallet.sync.reconciled`, con la differenza trovata).

Errori più comuni:
- `E_GOOGLE_AUTH`: chiave del service account sbagliata/revocata o service account non utente (Developer)
  dell'emittente nella Google Pay & Wallet Console. Colpisce **tutte** le carte: molte righe uguali in poco tempo.
- `E_GOOGLE_INVALID_PAYLOAD`: Google rifiuta i dati; `provider_response` dice il campo (spesso il logo: deve essere
  PNG/JPEG pubblico, raggiungibile da Google).
- `E_GOOGLE_NOT_FOUND`: template o carta mancanti (es. Issuer ID cambiato): `pnpm wallet:resync --shop <slug>`.

## Iscrizione del cliente: "non riesco a iscrivermi" / "non mi arriva l'SMS"

Tutte le righe di un'iscrizione hanno lo stesso `enrollment_id` (e lo stesso `shop_id`): filtrando per quello si vede
in quale passo si è fermato il cliente. Ordine normale del funnel:
`enroll.form.submitted` → `enroll.otp.sent` → `enroll.otp.verified` → `enroll.customer.created` (o `.returning`) →
`enroll.wallet.link.shown` → `enroll.wallet.link.clicked`.

- **Si ferma dopo `form.submitted`**:
  - `enroll.captcha.failed`: controllo anti-bot non superato (pagina aperta da troppo, blocco contenuti). Far
    ricaricare la pagina. Se succede a molti: chiavi Turnstile sbagliate.
  - `enroll.otp.limited`: troppi SMS per quel numero (3/ora, 5/giorno), per quell'IP (10/ora) o numero bloccato dopo
    5 codici sbagliati (15 minuti). Il `msg` dice quale limite e tra quanto riprovare. Molti blocchi da IP diversi in
    poco tempo = possibile abuso (SMS pumping): avvisare lo sviluppo.
  - `enroll.otp.send_failed`: Twilio non ha inviato l'SMS; `provider_response` dice perché (credenziali, credito,
    numero rifiutato). Controllare la console Twilio.
- **SMS inviato ma il cliente non lo riceve**: `enroll.otp.sent` c'è. Far controllare il numero (nel log è mascherato:
  confrontare le ultime 4 cifre), aspettare 60 secondi e chiedere "Invia un nuovo codice". Verificare nella console
  Twilio (Verify → Logs) l'esito della consegna.
- **Codice sbagliato**: `enroll.otp.wrong_code` con i tentativi rimasti; al quinto `enroll.otp.too_many_attempts` e
  numero bloccato 15 minuti.
- **Carta creata ma non salvata nel Wallet**: c'è `enroll.wallet.link.shown` ma non `.clicked`. Su iPhone, finché non
  c'è Apple Wallet (Fase 12), la pagina mostra il QR e il codice breve da mostrare in cassa.
- **Pagina "Qui non c'è nessuna carta" / "Carta momentaneamente non disponibile"**: `enroll.shop.unavailable` con lo
  slug richiesto (QR stampato con un link sbagliato) o negozio sospeso.

Il cliente che rifà l'iscrizione con lo stesso numero ritrova la stessa carta con i timbri (`enroll.customer.returning`).
Nome e telefono delle iscrizioni non completate vengono cancellati dopo 24 ore; i contatori dei limiti tengono il
telefono solo come impronta (hash).

## Disiscrizione dalle promozioni

Il link nei messaggi (`/u/<token>`) è firmato e vale una volta: `marketing.unsubscribe.ok` (con
`already_unsubscribed: true` se il link era già stato usato). Il consenso revocato è in `audit_log`
(`action = marketing_consent`, `actor_type = customer`). Link manomesso o di una carta cancellata:
`public.link.invalid`, il cliente vede "Link non valido" e può chiedere in negozio.

## Il cron dei wallet

Ogni minuto `pg_cron` (Supabase) chiama `POST /api/internal/cron/wallet-sync`: nuovi tentativi, riconciliazione, invio
delle promozioni. Una riga `cron.wallet_sync.run` per ogni esecuzione che ha fatto qualcosa.
- Nessuna riga per molto tempo e tentativi in coda in `wallet_sync_failures` con `next_retry_at` passato: il cron non
  arriva all'app. Verificare con `select * from cron.job_run_details order by start_time desc limit 5` e le risposte
  in `net._http_response`; riconfigurare con `pnpm cron:configure --url https://<dominio>/api/internal/cron/wallet-sync`.
- `E_CRON_UNAUTHORIZED`: `CRON_SECRET` dell'app diverso da quello nel Vault: rieseguire `pnpm cron:configure`.

## Promozioni

`promo.send.queued` (prenotata dal titolare) → il cron prepara le consegne per i clienti con consenso in quel momento
e le invia a gruppi di 50 → `promo.send.completed` con consegnate, saltate (consenso revocato nel frattempo, carta
non presente su Google) e fallite. Ogni consegna è in `promotion_deliveries`; il messaggio ha id `promo-<id>` per
carta, quindi un nuovo tentativo non lo duplica mai. Il link di disiscrizione nel messaggio è firmato
(`UNSUBSCRIBE_SECRET`) e porta a `/u/<token>`.

Dall'app (Messaggi): una promozione **a settimana** (7 giorni dall'ultima non annullata). Il titolare vede prima
dell'invio quanti la riceveranno e da quando potrà mandare la prossima; un secondo tentativo dà
`E_PROMO_WEEKLY_LIMIT` con la data. "0 destinatari" (`E_PROMO_NO_RECIPIENTS`): nessun cliente ha il consenso, lo
danno i clienti iscrivendosi.

## Carta disattivata

`wallet.card.deactivated`: la carta su Google è `INACTIVE` perché il cliente è stato cancellato o il negozio è
sospeso. Alla riattivazione del negozio il cron le riattiva da solo entro qualche minuto; per farlo subito, scheda del
negozio → "Risincronizza tutto il negozio" (o `pnpm wallet:resync --shop <slug>`).

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

Dall'app (Clienti → Cancella cliente) serve una doppia conferma: un avviso con le conseguenze, poi il codice breve
della carta scritto a mano. `customer.delete.ok`: nome, telefono e consensi rimossi, storico di audit pseudonimizzato
(restano id, conteggi e date).
La carta nel Wallet del cliente non è più valida: scansionandola si ottiene `E_CARD_DELETED`. Il cliente può
reiscriversi con lo stesso numero e riceve una carta nuova. Da Fase 4 la carta Google viene anche disattivata.

## App esercente: "dice che non ho i permessi" / "non vedo il negozio"

- `auth.token.invalid`: sessione scaduta o token non valido → far rifare il login nell'app.
- `auth.forbidden.shop`: l'utente non è nello staff del negozio indicato dall'app (`shop_id` nel log). Verificare la
  tabella `staff`; se manca, il titolare lo invita dall'app.
- `auth.forbidden.role`: un operatore ha aperto una funzione del titolare (statistiche, clienti, impostazioni, staff,
  promozioni). È il comportamento atteso; se deve essere titolare, il titolare cambia il ruolo dall'app.

## App esercente: "non riesco ad accedere"

L'app (iOS, Android, web) registra i propri eventi `app.*` in un buffer sul dispositivo e in Sentry, non nei log del
backend: per vederli serve il pacchetto "Invia diagnostica" (vedi sotto) o Sentry.

- **Email o password non corrette** (`app.login.failed` con `E_LOGIN_FAILED`): far usare "Password dimenticata?".
  Se l'utente non ha mai accettato l'invito non ha una password: il titolare lo reinvita dalla sezione Staff.
- **"Server non raggiungibile"** (`E_NETWORK`): il login passa da Supabase Auth, non dal nostro backend. Controllare
  la rete del negozio e lo stato di Supabase.
- **"La sessione è scaduta. Accedi di nuovo."** (`app.logout` con motivo "sessione scaduta", `E_SESSION_EXPIRED`):
  l'app rinnova da sola il token una volta; se il rinnovo fallisce (password cambiata altrove, utente rimosso dallo
  staff, app chiusa per molto tempo) chiude la sessione. Basta rifare il login.
- **"Nessun negozio collegato"**: l'account esiste ma non è nella tabella `staff` di nessun negozio. Il titolare lo
  invita con la stessa email.
- **Vede il negozio sbagliato**: chi lavora in più negozi sceglie all'accesso ("Dove lavori oggi?"); l'app ricorda
  l'ultima scelta e si cambia da Profilo → "Cambia negozio" (`app.shop.selected`).

## App esercente: invito e nuova password

- L'email d'invito (template `supabase/templates/invito.html`) porta a `MERCHANT_APP_URL/invito`: la web app legge
  il link, chiede la password e apre l'app. Il link vale 24 ore e si usa una volta: se è scaduto la pagina lo dice e
  il titolare reinvia l'invito. Senza dominio i link aprono la web app anche dal telefono; dalla Fase 13 (dominio e
  Universal/App Links) apriranno direttamente l'app installata.
- "Password dimenticata?" manda un'email (template `recupero.html`) con un link a `/nuova-password`, valido un'ora.
  L'app mostra sempre "Controlla la posta" anche se l'email non è registrata (non rivela chi è nello staff).
- In locale le email non partono davvero: si leggono in Mailpit su http://127.0.0.1:54324.
- In produzione serve un SMTP configurato in Supabase (Fase 13): il server email di default invia pochissime email
  all'ora.

## App esercente: codice assistenza mostrato dall'app

Ogni errore dell'app mostra il messaggio e un codice `ERR-XXXXX` copiabile. Si cerca come qualsiasi codice
assistenza (sezione in cima). Se nel backend **non c'è** nessuna riga con quel codice, la richiesta non è mai
arrivata al server:

- `E_OFFLINE`: il dispositivo era offline, l'app non ha nemmeno provato (in questo caso il codice non viene mostrato);
- `E_NETWORK`: l'app ha provato ma il server non ha risposto (rete del negozio, Wi-Fi senza internet, server giù);
- `E_BAD_RESPONSE`: il server ha risposto qualcosa di inatteso (app non aggiornata o proxy di rete).

Nel pacchetto diagnostica la riga `app.api.error` con lo stesso `support_code` riporta metodo, endpoint, status e
durata; il `request_id` è lo stesso che il backend scrive nei suoi log.

## App esercente: "Sei offline"

Il banner compare quando il dispositivo perde la connessione (`app.offline`) e sparisce quando torna (`app.online`
con la durata). Nel frattempo le azioni che richiedono il server sono disattivate. Se l'esercente dice di essere
online ma vede il banner, il dispositivo non ha una rete attiva (es. Wi-Fi collegato senza internet su alcuni
Android): far disattivare e riattivare il Wi-Fi.

## Una sessione di timbratura nei log

Ogni passo ha la sua riga. Quelle dell'app (`scan.*`, nel pacchetto "Invia diagnostica" e in Sentry) e quelle del
backend (`customer.lookup.*`, `stamp.*`, `reward.*`) hanno lo stesso `customer_ref` (codice breve della carta).
Esempio da una sessione di prova in locale (lettura, timbro, annullamento):

```
app      scan.read.ok          Letto il QR di una carta con lettore QR esterno.
backend  customer.lookup.ok    Marco (operatore, web 0.1.0) ha aperto la carta V9Q45RUZ del negozio Barbiere Demo con la scansione del QR (0/10 timbri, premi disponibili: 0).
app      scan.card.shown       Scheda della carta V9Q45RUZ aperta in 194 ms dalla lettura (lettore QR esterno).
backend  stamp.add.ok          Marco (operatore, web 0.1.0) ha aggiunto un timbro alla carta V9Q45RUZ del negozio Barbiere Demo: 0 → 1 su 10.
app      scan.stamp.confirmed  Timbro sulla carta V9Q45RUZ confermato in 104 ms dal tocco, 0.8 s dalla lettura del codice.
backend  stamp.undo.ok         Marco (operatore, web 0.1.0) ha annullato l'ultimo timbro della carta V9Q45RUZ del negozio Barbiere Demo: 1 → 0 su 10.
```

`scan.stamp.confirmed` misura il tempo dalla lettura del codice al timbro confermato: con buona rete deve stare sotto
i 2 secondi. Se è molto più alto, guardare `duration_ms` delle righe `http.request.end` del backend per la stessa
carta: se il server è veloce, il problema è la rete del negozio.

## "Lo scanner non legge"

- **Fotocamera**: QR troppo piccolo, riflesso dello schermo del cliente, poca luce (c'è la torcia). Far alzare la
  luminosità del telefono del cliente. Nessuna riga `scan.read.*` = la fotocamera non ha visto un QR.
- **`scan.read.invalid`**: è stato letto qualcosa che non è una carta (un URL, un codice a barre del prodotto, un
  codice breve incompleto). Il motivo è nel campo `reason`. Il cliente ha aperto la cosa sbagliata.
- **Lettore QR esterno**: deve essere configurato come tastiera con Invio finale (impostazione di fabbrica di
  quasi tutti). Il campo del lettore nell'app deve essere a fuoco ("Pronto: scansiona con il lettore"): se è stato
  toccato altro, l'app lo rimette a fuoco da sola.
- **Web su Safari, Firefox o Chrome per Windows**: la decodifica usa il motore ZXing servito dalla web app
  (`/zxing/zxing_reader.wasm`). Se manca (deploy incompleto) la webcam si vede ma non legge nulla: usare lettore o
  codice breve e verificare il deploy.
- In ogni caso il **codice breve** stampato sotto il QR funziona sempre (modalità "Codice").

## Permesso della fotocamera negato (`scan.camera.denied`)

- iOS e Android: con `can_ask_again: false` il permesso va riattivato da Impostazioni → app Loyalty Wallet
  Esercente → Fotocamera; l'app mostra il pulsante "Apri le impostazioni".
- Web: icona del lucchetto/fotocamera accanto all'indirizzo del browser → Consenti. Sul sito non in HTTPS il
  browser non concede mai la fotocamera.

## "Ho dato due timbri con un tocco" / "il timbro c'è due volte"

Ogni tocco su "+1 timbro", "Annulla ultimo timbro" e "Riscatta premio" porta una chiave (`Idempotency-Key`): una
seconda richiesta con la stessa chiave (doppio tocco, rete che ripete) non agisce e lascia
`stamp.add.duplicate_ignored` (o `stamp.undo.…`, `reward.redeem.…`). Se ci sono davvero due `stamp.add.ok` per la
stessa carta, sono due tocchi distinti: con il cooldown attivo il secondo è possibile solo con "Aggiungi comunque"
(vedi sotto). Si corregge con "Annulla ultimo timbro" entro 5 minuti, poi con la correzione del saldo del titolare.

## Timbro forzato durante il cooldown (`stamp.add.forced`)

Lo staff ha premuto "Aggiungi comunque" sul foglio "Timbro già dato da poco". Il timbro vale, ma resta nell'audit
(`audit_log.reason = 'timbro forzato durante il cooldown'`, con i minuti mancanti in `after`) e nel log a livello
warn. Se succede spesso con lo stesso operatore o la stessa carta, segnalarlo al titolare.

## "La carta non viene trovata" alla scansione

- `customer.lookup.not_found`: il QR o il codice breve non corrisponde a nessuna carta. Far riscansionare o digitare
  il codice breve stampato sotto il QR.
- `customer.lookup.other_shop`: la carta è valida ma di un **altro negozio** (`E_QR_OTHER_SHOP`). Il cliente ha
  mostrato la carta sbagliata, oppure l'esercente con più negozi ha selezionato quello sbagliato nell'app.
- `E_CARD_DELETED`: carta di un cliente cancellato (vedi sopra).

## "Troppe richieste" (`E_RATE_LIMITED`)

`ratelimit.hit` indica il limite superato (per utente o per IP) e tra quanti secondi si può riprovare. Limiti di
default: 120 richieste al minuto per utente, 300 per IP (`RATE_LIMIT_USER_PER_MIN`, `RATE_LIMIT_IP_PER_MIN`).
Se succede a un esercente in uso normale: probabile app in loop o lettore QR che ripete il codice → raccogliere la
diagnostica dall'app. I contatori sono nella tabella `rate_limit_counters` (finestre di 60 secondi).

## La web app esercente non riesce a chiamare le API (`E_CORS_ORIGIN`)

Il dominio da cui è aperta la web app non è in `MERCHANT_APP_ORIGINS`. Se è un nostro dominio nuovo, aggiungerlo
alla variabile nel progetto Vercel (separato da virgola, senza `/` finale) e rifare il deploy.

## L'email d'invito dello staff non arriva

`staff.invite.sent` conferma che l'invito è partito (o che l'utente aveva già un account: in quel caso nessuna
email, può entrare con le credenziali che ha). Nell'app (Staff) chi non ha ancora accettato compare "in attesa":
"Reinvia" manda di nuovo l'email (`staff.invite.resent`). `E_INVITE_FAILED` riporta il messaggio di Supabase Auth: di solito
SMTP non configurato o limite di invio raggiunto (il server email di default di Supabase invia pochissime email
l'ora). Il link dell'email porta a `MERCHANT_APP_URL/invito`.

## Area titolare: chi ha fatto cosa

Ogni azione del titolare ha la sua riga con un `msg` completo, filtrabile per `shop_id` e `user_id`:
`stats.viewed` (apertura della panoramica), `customer.search` (tipo di ricerca, mai il testo cercato),
`balance.adjust.ok` (saldo prima → dopo e motivo), `customer.marketing.changed`, `customer.delete.ok`,
`settings.update.ok` (ogni campo cambiato, prima → dopo), `logo.upload.ok` / `logo.upload.failed`,
`staff.invite.sent` / `staff.invite.resent` / `staff.role.changed` / `staff.revoked`, `promo.send.queued`,
`counter_qr.downloaded`. Lo storico permanente delle stesse azioni è in `audit_log`.

## "Ho cambiato colore o logo ma la carta sul telefono non cambia"

1. `settings.update.ok` con "colore …" o "logo sostituito" conferma il salvataggio; se manca, il titolare non ha
   premuto "Salva e aggiorna le carte".
2. Il template Google si aggiorna subito (`wallet.class.*`), le carte una per una dal cron entro qualche minuto
   (`wallet.object.*` con il nuovo `card_version`). Google Wallet sul telefono può metterci qualche minuto in più a
   ridisegnare la carta.
3. Logo: Google lo scarica dal suo URL pubblico. In locale (Supabase su 127.0.0.1) Google non lo raggiunge: per una
   prova serve un tunnel (vedi README). In produzione l'URL è quello pubblico dello Storage.
   Se l'immagine non è raggiungibile Google rifiuta **tutto** il template, colore compreso:
   `wallet.google.class.upsert.failed` con `E_GOOGLE_INVALID_PAYLOAD` e in `provider_response` "Image cannot be
   loaded. Invalid image URL …". Vale anche per i negozi senza logo, che usano `CARD_DEFAULT_LOGO_URL`: deve essere un
   indirizzo pubblico. Corretto l'URL, `pnpm wallet:resync --shop <slug>`.
4. Se il colore scelto non ha abbastanza contrasto, la carta usa una variante corretta: l'app lo dice prima del
   salvataggio ("Per la leggibilità la carta userà …").

## "Ho tolto il consenso a un cliente e non riesco a ridarlo" (`E_CONSENT_BY_CUSTOMER_ONLY`)

È voluto: il consenso alle promozioni lo dà solo il cliente. Dall'app si può solo revocare. Il cliente può darlo di
nuovo riaprendo la pagina di iscrizione del negozio con lo stesso numero e spuntando le promozioni.

## L'esercente ha inviato la diagnostica dall'app

Ci comunica un codice `DIAG-XXXXXXXX` (Profilo → "Invia diagnostica all'assistenza"): `diagnostics.received` lo
conferma, il pacchetto è nella tabella `diagnostic_bundles` (`ticket_code`). Si apre cercando il ticket nella vista
Assistenza (o da Diagnostica → Pacchetti ricevuti): dispositivo ed eventi raggruppati per richiesta.

Cosa contiene:
- `device`: piattaforma, versione e build dell'app, modello o browser, sistema operativo, lingua, fuso orario, tipo
  di connessione, permessi (la fotocamera dalla Fase 7);
- `events`: gli ultimi eventi `app.*` (al massimo 500, i più vecchi scartati se il pacchetto supera 256 KB), già
  redatti come i log del backend: email mascherate, nessun token. Si leggono dal più vecchio al più recente;
  `app.start` segna ogni apertura dell'app, `app.api.error` ogni chiamata fallita con il suo `request_id`.

Crash ed errori JavaScript dell'app sono anche in **Sentry** (progetto dell'app esercente), con gli stessi campi
`shop_id`, `role`, `platform`, `app_version` e, per gli errori API, `request_id` ed `error_code` come tag.

## Logo o impostazioni non salvati

- `E_LOGO_INVALID` con `logo.upload.failed`: lo stadio dice dove si è fermato. "caricamento": il file non è arrivato
  allo Storage (rete del negozio); "verifica": il server ha rifiutato il file (formato, peso oltre 2 MB, file di un
  altro negozio o caricamento non completato). L'app ritaglia il logo quadrato e lo riduce a 660 px prima di
  caricarlo (in JPEG se il PNG supera 2 MB, come succede con le foto dell'iPhone), quindi un file troppo pesante è
  raro. Il logo precedente resta finché non ne passa uno valido.
- `settings.update.ok` riporta ogni campo cambiato con il valore prima → dopo; lo storico completo è in `audit_log`
  (`action = settings_update`).

## Servizio esterno lento o in errore

Le chiamate passate da `fetchExternal` producono `external.call.ok` / `external.call.failed` con provider,
endpoint, status HTTP, durata, tentativo e (in errore) la risposta del provider, già redatta e troncata a 4 KB.
`http_status` vuoto significa nessuna risposta (timeout o rete): controllare la pagina di stato del provider.

## Serve più dettaglio: modalità diagnostica

Per un problema che i log normali non spiegano, attivare la modalità diagnostica **solo** sullo scope interessato.
Registra anche i payload delle richieste e delle chiamate esterne (sempre redatti) e i log `debug`.

Dal pannello: scheda del negozio, del cliente o dell'utente → "Modalità diagnostica" (durata, livello, motivo);
le attive sono in Diagnostica, da dove si spengono. Restano nello storico (`diagnostic_enable` / `diagnostic_disable`)
e nei log (`support.diagnostic.enabled` / `disabled`). In alternativa, da riga di comando:

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
- In produzione lo script va eseguito con le variabili dell'ambiente di produzione; di norma si usa il pannello.
- Le righe di diagnostica copiate per la vista Assistenza si tengono 7 giorni (le altre 30).

## Pannello interno: accesso

- Solo chi è in `support_members` (`pnpm support:add <email> --name <nome> --by <chi>`), con password e **codice
  dell'app di autenticazione** (TOTP). Al primo accesso il pannello mostra il QR da inquadrare.
- La sessione dura 12 ore dall'ultimo codice, poi si rientra.
- "Questo account non fa parte del team" (`E_SUPPORT_FORBIDDEN`, `support.access.denied` con "non nel team"): account
  di un esercente o membro disattivato.
- Codice rifiutato (`E_SUPPORT_LOGIN_FAILED` al passo "codice"): codice scaduto (30 s) o ora del telefono sbagliata.
- Telefono con l'app perso: in Supabase (Authentication → utente → MFA) eliminare il fattore; al prossimo accesso si
  ricollega con un nuovo QR.

## Negozi dal pannello

- **Nuovo negozio** (`shop.created`): nome, indirizzo della pagina di iscrizione (slug), titolare (riceve l'email
  d'invito se non ha già un account), dati per l'informativa. Slug già usato o riservato (`interno`, `api`, …):
  `E_SHOP_SLUG_TAKEN`.
- **Sospensione / riattivazione** con motivo (`shop.suspended` / `shop.reactivated`): app esercente e pagina di
  iscrizione bloccate, carte disattivate su Google dal cron entro qualche minuto (e riattivate alla riattivazione).
- **Dati per l'informativa** (`shop.legal.updated`): ragione sociale, partita IVA, email privacy, mostrati nella
  pagina privacy del negozio e nell'esportazione GDPR.

## Richieste GDPR (accesso e cancellazione)

- **Accesso** (art. 15): scheda del cliente → motivo → "Esporta i dati (JSON)". Il file contiene dati, consensi,
  saldo, storico, stato nei wallet e promozioni ricevute; si invia all'interessato da un canale sicuro.
  `support.customer.export`, storico `customer_export`.
- **Cancellazione**: scheda del cliente → motivo → codice della carta come conferma. Nome, telefono (anche l'hash) e
  consensi tolti, storico pseudonimizzato, carta disattivata su Google. `support.customer.delete`, storico
  `customer_delete` con `actor_type = support`.

## Log nella vista Assistenza (copia in Postgres)

- Ogni riga di log del server è copiata anche in `log_events` a fine richiesta (`LOG_DB_SINK`, attiva di default).
  Se la copia fallisce compare `log.db_sink.failed` sul servizio di log esterno: le righe mancano nella timeline ma
  restano su Axiom.
- Pulizia dal cron: 30 giorni, 7 per le righe di modalità diagnostica (`log.retention.purged`).
- Dopo la migrazione della Fase 9, `pnpm support:phone-hash` calcola l'hash del telefono per le carte già esistenti
  (quelle nuove lo hanno dall'iscrizione).

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
| `enroll.form.submitted` | info | Funnel di iscrizione, passo 1: il cliente ha compilato il form (nome, telefono, consensi). | Iscrizione avviata al negozio Salone Mario dal web pubblico: form compilato (consenso marketing: sì). |
| `enroll.captcha.failed` | warn | Funnel di iscrizione: il controllo anti-bot non è stato superato, nessun SMS inviato. | Iscrizione al negozio Salone Mario fermata dal controllo anti-bot (timeout-or-duplicate): nessun SMS inviato. |
| `enroll.otp.sent` | info | Funnel di iscrizione, passo 2: SMS con il codice inviato (o nuovo codice chiesto dal cliente). | SMS con il codice inviato per l'iscrizione al negozio Salone Mario in 640 ms. |
| `enroll.otp.send_failed` | error | Funnel di iscrizione: il fornitore SMS non ha inviato il codice. Il cliente non può proseguire. | SMS con il codice NON inviato per l'iscrizione al negozio Salone Mario: Twilio ha risposto status 401 ("Authenticate"). Azione: controllare credito e credenziali Twilio. |
| `enroll.otp.limited` | warn | Funnel di iscrizione: SMS non inviato per un limite (per numero, per IP o numero bloccato). Molti blocchi per IP = possibile abuso. | SMS per l'iscrizione al negozio Salone Mario non inviato: superato il limite per numero. Si può riprovare tra 60 minuti. |
| `enroll.otp.verified` | info | Funnel di iscrizione, passo 3: codice corretto, telefono verificato. | Telefono verificato per l'iscrizione al negozio Salone Mario (al primo tentativo). |
| `enroll.otp.wrong_code` | warn | Funnel di iscrizione: codice sbagliato, il cliente ha ancora tentativi. | Codice sbagliato nell'iscrizione al negozio Salone Mario: restano 2 tentativi. |
| `enroll.otp.too_many_attempts` | warn | Funnel di iscrizione: 5 codici sbagliati, iscrizione annullata e numero bloccato. | Iscrizione al negozio Salone Mario bloccata dopo 5 codici sbagliati: il numero potrà riprovare tra 15 minuti. |
| `enroll.wallet.link.shown` | info | Funnel di iscrizione, passo 5: al cliente è stato mostrato il modo per salvare la carta. | Al cliente della carta A3F2C91B (negozio Salone Mario) è stato mostrato il pulsante Aggiungi a Google Wallet. |
| `enroll.wallet.link.clicked` | info | Funnel di iscrizione, ultimo passo: il cliente ha aperto il link per salvare la carta nel Wallet. | Il cliente della carta A3F2C91B (negozio Salone Mario) ha aperto il link per salvare la carta nel Wallet. |
| `enroll.shop.unavailable` | warn | Qualcuno ha aperto la pagina di iscrizione di un negozio inesistente o sospeso. | Pagina di iscrizione aperta per "salone-norra", che non corrisponde a nessun negozio (QR o link sbagliato?). |

### stamp

| Evento | Livello | Quando compare | Esempio di `msg` |
| --- | --- | --- | --- |
| `stamp.add.ok` | info | Un membro dello staff ha aggiunto un timbro a una carta. | Giulia (operatore, iOS 1.4.0) ha aggiunto un timbro alla carta A3F2C91B del negozio Salone Mario: 6 → 7 su 10. |
| `stamp.add.rejected_cooldown` | warn | Timbro rifiutato perché troppo vicino al precedente (tempo minimo tra due timbri impostato dal negozio). | Timbro di Giulia (operatore, iOS 1.4.0) rifiutato sulla carta A3F2C91B del negozio Salone Mario: ultimo timbro 8 minuti fa, il negozio richiede almeno 60 minuti tra due timbri (mancano 52 minuti). |
| `stamp.add.forced` | warn | Timbro dato durante il cooldown con "Aggiungi comunque": resta nell'audit. Se succede spesso, parlarne con il titolare. | Giulia (operatore, iOS 1.4.0) ha forzato un timbro sulla carta A3F2C91B del negozio Salone Mario durante il cooldown (mancavano 52 minuti su 60 minuti): 6 → 7 su 10, registrato nell'audit. |
| `stamp.add.duplicate_ignored` | info | Doppio tocco o richiesta ripetuta dalla rete su "+1 timbro": la stessa chiave di idempotenza non dà un secondo timbro. | Richiesta ripetuta di Giulia (operatore, iOS 1.4.0) (timbro sulla carta A3F2C91B del negozio Salone Mario) ignorata: è la stessa del 03/11/2026 10:32 (ora italiana) (1 s prima), già eseguita una volta sola. |
| `stamp.undo.duplicate_ignored` | info | Richiesta di annullamento ripetuta con la stessa chiave: eseguita una volta sola. | Richiesta ripetuta di Giulia (operatore, iOS 1.4.0) (annullamento del timbro sulla carta A3F2C91B del negozio Salone Mario) ignorata: è la stessa del 03/11/2026 10:32 (ora italiana) (1 s prima), già eseguita una volta sola. |
| `stamp.undo.ok` | info | Un membro dello staff ha annullato l'ultimo timbro che aveva dato (entro 5 minuti). | Giulia (operatore, iOS 1.4.0) ha annullato l'ultimo timbro della carta A3F2C91B del negozio Salone Mario: 7 → 6 su 10. |
| `stamp.undo.rejected` | warn | Annullamento dell'ultimo timbro rifiutato: tempo scaduto, altro operatore, carta già modificata. | Annullamento dell'ultimo timbro chiesto da Giulia (operatore, iOS 1.4.0) sulla carta A3F2C91B del negozio Salone Mario rifiutato: il timbro è stato dato 12 minuti fa (limite 5 minuti). |

### reward

| Evento | Livello | Quando compare | Esempio di `msg` |
| --- | --- | --- | --- |
| `reward.unlocked` | info | Una carta ha raggiunto i timbri richiesti: il premio è disponibile. | La carta A3F2C91B del negozio Salone Mario ha raggiunto 10 timbri: premio "Taglio gratis" sbloccato (premi disponibili: 1). |
| `reward.redeem.duplicate_ignored` | info | Richiesta di riscatto ripetuta con la stessa chiave: il premio è scalato una volta sola. | Richiesta ripetuta di Giulia (operatore, iOS 1.4.0) (riscatto del premio sulla carta A3F2C91B del negozio Salone Mario) ignorata: è la stessa del 03/11/2026 10:32 (ora italiana) (1 s prima), già eseguita una volta sola. |
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
| `customer.lookup.ok` | info | Lo staff ha trovato una carta (scansione del QR o codice breve digitato). | Giulia (operatore, iOS 1.4.0) ha aperto la carta A3F2C91B del negozio Salone Mario con la scansione del QR (6/10 timbri, premi disponibili: 0). |
| `customer.lookup.not_found` | warn | Scansione o codice breve che non corrisponde a nessuna carta. | Giulia (operatore, iOS 1.4.0) ha cercato una carta nel negozio Salone Mario con un codice breve che non corrisponde a nessuna carta: QR non nostro, letto male o codice digitato male. |
| `customer.lookup.other_shop` | warn | Scansione di una carta valida ma di un altro negozio. | Giulia (operatore, iOS 1.4.0) ha scansionato nel negozio Salone Mario una carta che appartiene a un altro negozio: il cliente ha mostrato la carta sbagliata o l'app ha selezionato il negozio sbagliato. |
| `customer.search` | info | Il titolare ha consultato o cercato nella lista clienti (il testo cercato non viene registrato). | Mario (titolare, web) ha cercato tra i clienti del negozio Salone Mario per telefono (1 risultati). |

### auth

| Evento | Livello | Quando compare | Esempio di `msg` |
| --- | --- | --- | --- |
| `auth.token.invalid` | warn | Richiesta all'API esercente con un token di accesso scaduto o non valido: l'app deve far rifare il login. | Accesso rifiutato a /api/v1/merchant/stamp: token scaduto. L'utente deve rifare il login. |
| `auth.forbidden.shop` | warn | Un utente autenticato ha chiesto dati o operazioni di un negozio a cui non appartiene. | Accesso a /api/v1/merchant/customers negato: l'utente 55555555-5555-4555-8555-555555555555 non fa parte dello staff del negozio 99999999-9999-4999-8999-999999999999. |
| `auth.forbidden.role` | warn | Un operatore ha chiesto una funzione riservata al titolare. | Giulia (operatore, iOS 1.4.0) ha chiesto /api/v1/merchant/stats del negozio Salone Mario, riservata al titolare: negato. |

### ratelimit

| Evento | Livello | Quando compare | Esempio di `msg` |
| --- | --- | --- | --- |
| `ratelimit.hit` | warn | Superato il limite di richieste al minuto (per utente o per IP): la richiesta è stata rifiutata. | Troppe richieste a /api/v1/merchant/scan/lookup dallo stesso utente: superato il limite di 120 in 60 secondi. Richiesta rifiutata, si può riprovare tra 34 secondi. |

### stats

| Evento | Livello | Quando compare | Esempio di `msg` |
| --- | --- | --- | --- |
| `stats.viewed` | info | Il titolare ha aperto la dashboard con le statistiche del negozio. | Mario (titolare, web) ha aperto le statistiche del negozio Salone Mario (148 clienti iscritti). |

### settings

| Evento | Livello | Quando compare | Esempio di `msg` |
| --- | --- | --- | --- |
| `settings.update.ok` | info | Il titolare ha modificato le impostazioni del negozio o della carta. | Mario (titolare, web) ha aggiornato le impostazioni del negozio Salone Mario: colore #1f2937 → #7c3aed, timbri richiesti 10 → 8. |

### logo

| Evento | Livello | Quando compare | Esempio di `msg` |
| --- | --- | --- | --- |
| `logo.upload_url.issued` | info | Il titolare ha chiesto di caricare un nuovo logo: rilasciato un URL di caricamento firmato. | Mario (titolare, web) sta caricando un nuovo logo per il negozio Salone Mario (image/png, 180 KB): URL di caricamento rilasciato. |
| `logo.upload.ok` | info | Il nuovo logo è stato caricato, verificato e pubblicato: le carte nel Wallet si aggiornano. | Mario (titolare, web) ha pubblicato il nuovo logo del negozio Salone Mario (image/png, 180 KB): le carte nel Wallet si aggiornano entro qualche minuto. |
| `logo.upload.failed` | warn | Logo non caricato: invio del file allo Storage fallito (dall'app) o file non valido alla verifica (dal server). Il logo precedente resta. | Logo del negozio Salone Mario non aggiornato: invio del file non riuscito (rete interrotta). Resta il logo precedente. |

### staff

| Evento | Livello | Quando compare | Esempio di `msg` |
| --- | --- | --- | --- |
| `staff.invite.resent` | info | Il titolare ha reinviato l'email d'invito a chi non l'aveva ancora accettato. | Mario (titolare, web) ha reinviato l'invito del negozio Salone Mario a Ilaria (il***@gmail.com). |
| `staff.invite.sent` | info | Il titolare ha aggiunto una persona allo staff (con email d'invito se non aveva già un account). | Mario (titolare, web) ha aggiunto Giulia (gi***@salone.it) allo staff del negozio Salone Mario come operatore: inviata l'email d'invito. |
| `staff.role.changed` | info | Il titolare ha cambiato il ruolo (o il nome) di un membro dello staff. | Mario (titolare, web) ha cambiato il ruolo di Giulia nel negozio Salone Mario: operatore → titolare. |
| `staff.revoked` | info | Il titolare ha rimosso una persona dallo staff: non può più accedere al negozio. | Mario (titolare, web) ha rimosso Giulia (operatore) dallo staff del negozio Salone Mario. |

### promo

| Evento | Livello | Quando compare | Esempio di `msg` |
| --- | --- | --- | --- |
| `promo.send.queued` | info | Il titolare ha prenotato l'invio di una promozione ai clienti con consenso marketing. | Mario (titolare, web) ha prenotato una promozione del negozio Salone Mario (96 caratteri) per 42 clienti con consenso marketing. |
| `promo.send.completed` | info | Invio di una promozione completato: quanti clienti l'hanno ricevuta, saltati e falliti. | Promozione del negozio Salone Mario inviata: 40 consegnate, 2 saltate (consenso revocato o carta non disponibile), 0 fallite. |

### counter_qr

| Evento | Livello | Quando compare | Esempio di `msg` |
| --- | --- | --- | --- |
| `counter_qr.downloaded` | info | Il titolare ha scaricato il PDF del cartello A5 con il QR di iscrizione. | Mario (titolare, web) ha scaricato il cartello A5 del negozio Salone Mario (PDF di 47 KB, generato in 420 ms). |
| `counter_qr.public_downloaded` | info | Il PDF del cartello A5 è stato scaricato dalla pagina pubblica /<negozio>/qr. | Cartello A5 del negozio Salone Mario scaricato dalla pagina pubblica (PDF di 47 KB, 420 ms). |

### diagnostics

| Evento | Livello | Quando compare | Esempio di `msg` |
| --- | --- | --- | --- |
| `diagnostics.received` | info | L'app ha inviato il pacchetto "Invia diagnostica all'assistenza": cercarlo per codice ticket. | Giulia (operatore, iOS 1.4.0) ha inviato la diagnostica dell'app per il negozio Salone Mario: ticket DIAG-7K3QXA2M (412 eventi, 37 KB). |

### Wallet (Google / Apple)

| Evento | Livello | Quando compare | Esempio di `msg` |
| --- | --- | --- | --- |
| `wallet.google.class.upsert.ok` | info | Template del programma fedeltà del negozio creato o aggiornato su Google Wallet (nome, colore, logo). | Template Google Wallet del negozio Salone Mario aggiornato (3388000000022.shop-salone-mario) in 290 ms. |
| `wallet.google.class.upsert.failed` | error | Creazione o aggiornamento del template del negozio su Google Wallet fallito. | Aggiornamento del template Google Wallet del negozio Salone Mario fallito: credenziali del service account rifiutate (401); verrà ritentato tra 5 minuti. Azione: verificare la chiave GOOGLE_WALLET_SA_KEY_B64 e il ruolo del service account nella Wallet Console. |
| `wallet.google.object.upsert.ok` | info | Carta del cliente creata su Google Wallet (prima volta, o ricreata perché mancante). | Carta A3F2C91B del negozio Salone Mario creata su Google Wallet (0/10, 0 premi) in 341 ms. |
| `wallet.google.object.upsert.failed` | error | Creazione della carta del cliente su Google Wallet fallita. | Creazione su Google Wallet fallita per la carta A3F2C91B: credenziali del service account rifiutate (401). Il cliente è iscritto e può comunque salvare la carta dal link; verrà ritentato tra 5 minuti. Azione: verificare la chiave GOOGLE_WALLET_SA_KEY_B64 e il ruolo del service account nella Wallet Console. |
| `wallet.google.patch.ok` | info | Carta del cliente aggiornata su Google Wallet: Google la propaga da solo al telefono. | Carta A3F2C91B aggiornata su Google Wallet (7/10, 0 premi) in 341 ms. |
| `wallet.google.patch.failed` | error | Aggiornamento della carta su Google Wallet fallito. Il dato (timbro, premio…) è salvato nel database; la carta sul telefono resta indietro finché un tentativo non riesce. | Aggiornamento su Google Wallet fallito per la carta A3F2C91B: credenziali del service account rifiutate (401). Il dato è salvato; verrà ritentato tra 5 minuti. Azione: verificare la chiave GOOGLE_WALLET_SA_KEY_B64 e il ruolo del service account nella Wallet Console. |
| `wallet.google.message.sent` | info | Messaggio con notifica inviato a una carta su Google Wallet (premio sbloccato o promozione). | Notifica "premio sbloccato" inviata alla carta A3F2C91B del negozio Salone Mario su Google Wallet in 280 ms. |
| `wallet.google.message.failed` | error | Invio di un messaggio a una carta su Google Wallet fallito. | Notifica "promozione" non inviata alla carta A3F2C91B: credenziali del service account rifiutate (401); verrà ritentato tra 5 minuti. Azione: verificare la chiave GOOGLE_WALLET_SA_KEY_B64 e il ruolo del service account nella Wallet Console. |
| `wallet.sync.retry.scheduled` | info | Pianificato un nuovo tentativo automatico verso il wallet (backoff 1, 5, 15, 60 minuti). | Nuovo tentativo n. 2 per carta B71D0E44 su Google Wallet tra 1 minuto (03/11/2026 11:06 (ora italiana)), dopo l'errore E_GOOGLE_AUTH. |
| `wallet.sync.retry.exhausted` | error | Esauriti i tentativi automatici verso il wallet: la carta (o il template) resta disallineata finché non si risincronizza a mano. | Tentativi esauriti per carta B71D0E44 su Google Wallet dopo 5 errori (ultimo E_GOOGLE_AUTH: status 401). Azione: risolvere la causa e risincronizzare con pnpm wallet:resync. |
| `wallet.card.deactivated` | info | Carta resa non utilizzabile su Google Wallet (stato INACTIVE): cliente cancellato o negozio sospeso. | Carta A3F2C91B del negozio Salone Mario disattivata su Google Wallet: cliente cancellato. |
| `wallet.sync.reconciled` | info | La riconciliazione periodica ha trovato una carta non allineata al database e l'ha riallineata. | Carta A3F2C91B del negozio Salone Mario riallineata su Google Wallet dalla riconciliazione (differenza: saldo). |
| `wallet.sync.unexpected_error` | error | Errore imprevisto (non di Google) durante un lavoro verso i wallet: la riga contiene lo stack. La carta verrà riallineata dalla riconciliazione. | Errore imprevisto durante sincronizzazione carta verso i wallet: fetch failed (Supabase non raggiungibile). La carta verrà riallineata dalla riconciliazione; azione: passare lo stack di questa riga allo sviluppo. |
| `wallet.google.prepaid.upsert.ok` | info | Tessera prepagata creata o aggiornata su Google Wallet con lo stato completo (saldo, stato, scadenza). | Tessera K7M2Q9XA (Tessera fotocopie) aggiornata su Google Wallet: attiva, 138 pagine, in 320 ms. |
| `wallet.google.prepaid.upsert.failed` | error | Aggiornamento della tessera su Google Wallet fallito. L'operazione è salvata nel database; la tessera sul telefono resta indietro finché un tentativo non riesce. | Aggiornamento su Google Wallet fallito per la tessera K7M2Q9XA (Tessera fotocopie): credenziali del service account rifiutate (401). L'operazione è salvata; verrà ritentato tra 5 minuti. Azione: verificare la chiave GOOGLE_WALLET_SA_KEY_B64 e il ruolo del service account nella Wallet Console. |
| `wallet.google.prepaid_class.upsert.ok` | info | Template di un tipo di tessera creato o aggiornato su Google Wallet (nome, colore e logo del negozio). | Template Google Wallet della tessera «Tessera fotocopie» del negozio Cartoleria Rossi aggiornato (3388.shop-cartoleria-rossi-t-fotocopie) in 280 ms. |
| `wallet.google.prepaid_class.upsert.failed` | error | Aggiornamento del template di un tipo di tessera su Google Wallet fallito. | Aggiornamento del template Google Wallet della tessera «Tessera fotocopie» (Cartoleria Rossi) fallito: credenziali del service account rifiutate (401); verrà ritentato tra 5 minuti. Azione: verificare la chiave GOOGLE_WALLET_SA_KEY_B64 e il ruolo del service account nella Wallet Console. |

### marketing

| Evento | Livello | Quando compare | Esempio di `msg` |
| --- | --- | --- | --- |
| `marketing.unsubscribe.ok` | info | Il cliente si è disiscritto dalle promozioni con il link nel messaggio (link monouso). | Il cliente della carta A3F2C91B (negozio Salone Mario) si è disiscritto dalle promozioni dal link nel messaggio. |

### public

| Evento | Livello | Quando compare | Esempio di `msg` |
| --- | --- | --- | --- |
| `public.link.invalid` | warn | Qualcuno ha aperto un link pubblico firmato non valido (scaduto, manomesso o di una carta cancellata). | Aperto un link per salvare la carta non valido (scaduto): mostrata la pagina di link scaduto. |

### cron

| Evento | Livello | Quando compare | Esempio di `msg` |
| --- | --- | --- | --- |
| `cron.wallet_sync.run` | info | Esecuzione del cron dei wallet (ogni minuto): nuovi tentativi, riconciliazione, invio promozioni. | Cron wallet completato in 2140 ms: 2/3 tentativi riusciti, 1 carte riallineate, 40 promozioni consegnate, 0 fallite. |

### app

| Evento | Livello | Quando compare | Esempio di `msg` |
| --- | --- | --- | --- |
| `app.start` | info | L'app esercente è stata aperta: piattaforma, versione e dispositivo (prima riga della diagnostica). | App esercente avviata su iOS 26.4 (iPhone 15), versione 1.4.0 build 12. |
| `app.login.ok` | info | Lo staff ha fatto login nell'app. | Accesso riuscito per gi***@salone-mario.it: 1 negozio disponibile. |
| `app.login.failed` | warn | Login rifiutato: credenziali errate, invito non accettato o servizio non raggiungibile. | Accesso non riuscito per gi***@salone-mario.it: email o password non corrette (E_LOGIN_FAILED). |
| `app.logout` | info | Uscita dall'app: scelta dall'utente o forzata perché la sessione non si è potuta rinnovare. | L'utente è uscito dall'app con il pulsante Esci. |
| `app.shop.selected` | info | Negozio su cui l'app sta lavorando (scelto, cambiato o ricordato dall'ultima volta). | Negozio attivo nell'app: Salone Mario, ruolo titolare (l'unico disponibile). |
| `app.api.error` | warn | Una chiamata dell'app al server è fallita. Con il request_id si trova la riga corrispondente nei log del backend; se manca, la richiesta non è arrivata. | Chiamata POST /api/v1/merchant/stamp fallita con 400 in 120 ms: E_VALIDATION, codice assistenza ERR-K3QXM. |
| `app.offline` | warn | Il dispositivo ha perso la connessione: l'app mostra "Sei offline" e blocca le azioni che richiedono il server. | Il dispositivo è offline: mostrato il banner "Sei offline", azioni che richiedono il server bloccate. |
| `app.online` | info | La connessione è tornata dopo un periodo offline. | Connessione tornata dopo 42 secondi offline. |
| `app.diagnostics.sent` | info | L'utente ha premuto "Invia diagnostica all'assistenza" e il server ha restituito il codice ticket. | Diagnostica inviata all'assistenza: ticket DIAG-7K3QXA2M (412 eventi, 37 KB). |
| `app.password.reset_requested` | info | Richiesto il link per reimpostare la password ("Password dimenticata?"). | Richiesto il link per reimpostare la password di gi***@salone-mario.it. |
| `app.password.changed` | info | Lo staff ha impostato una nuova password, dal link di recupero o accettando l'invito. | Password reimpostata dal link di recupero e accesso eseguito. |
| `app.error.unexpected` | error | Errore imprevisto nel codice dell'app (non una risposta del server): va segnalato allo sviluppo con la diagnostica e Sentry. | Errore imprevisto nell'app durante il caricamento dei negozi: TypeError: shops.map is not a function. |
| `app.invite.accepted` | info | Lo staff ha aperto il link d'invito e la sessione è valida: deve solo scegliere la password. | Aperto il link d'invito di gi***@salone-mario.it: in attesa della scelta della password. |

### scan

| Evento | Livello | Quando compare | Esempio di `msg` |
| --- | --- | --- | --- |
| `scan.read.ok` | info | Lo scanner dell'app ha letto un codice valido (QR della carta o codice breve): parte la ricerca della carta. | Letto il QR di una carta con fotocamera. |
| `scan.read.invalid` | warn | Lo scanner ha letto qualcosa che non è una carta (altro QR, codice incompleto): nessuna chiamata al server. | Lettura scartata (fotocamera): URL di un sito, non è un QR della carta né un codice breve. |
| `scan.camera.denied` | warn | Permesso della fotocamera negato: lo scanner propone le impostazioni, il lettore esterno o il codice a mano. | Permesso della fotocamera negato: l'app può chiederlo di nuovo. |
| `scan.mode.changed` | info | Cambiata la modalità dello scanner (fotocamera, lettore QR esterno, codice a mano); viene ricordata. | Scanner passato da fotocamera a lettore QR esterno. |
| `scan.card.shown` | info | Scheda cliente aperta dopo una lettura: tempo dalla lettura alla scheda. | Scheda della carta A3F2C91B aperta in 420 ms dalla lettura (fotocamera). |
| `scan.stamp.confirmed` | info | Timbro confermato nell'app: tempo dal tocco alla conferma e dalla lettura del codice (obiettivo sotto i 2 secondi). | Timbro sulla carta A3F2C91B confermato in 310 ms dal tocco, 1.6 s dalla lettura del codice. |

### support

| Evento | Livello | Quando compare | Esempio di `msg` |
| --- | --- | --- | --- |
| `support.login` | info | Un membro del team è entrato nel pannello interno (password e codice dell'app di autenticazione). | Enea (assistenza) è entrato nel pannello interno con password e codice dell'app di autenticazione. |
| `support.login.failed` | warn | Accesso al pannello interno rifiutato (password, codice o collegamento dell'app di autenticazione). | Accesso al pannello interno rifiutato per en***@loyaltywallet.it al passo "password": email o password non corrette. Se si ripete con i dati giusti, vedere E_SUPPORT_LOGIN_FAILED nel runbook. |
| `support.access.denied` | warn | Qualcuno ha provato ad aprire una pagina o un'azione del pannello interno senza averne diritto. | Accesso negato al pannello interno (/interno) senza sessione: sessione assente. |
| `support.logout` | info | Un membro del team è uscito dal pannello interno. | Enea (assistenza) è uscito dal pannello interno. |
| `support.search` | info | Ricerca nella vista Assistenza (l'accesso ai dati è tracciato): tipo riconosciuto e numero di risultati. | Enea (assistenza) ha cercato codice errore "ERR-7K3QX": 1 risultato. |
| `support.timeline.viewed` | info | Apertura di una timeline nella vista Assistenza: chi ha consultato i log di quale negozio, cliente o richiesta. | Enea (assistenza) ha aperto la timeline di cliente A3F2C91B (42 righe). |
| `support.resync` | info | L'assistenza ha risincronizzato con Google Wallet una carta o un intero negozio dal pannello. | Enea (assistenza) ha risincronizzato la carta A3F2C91B del negozio Salone Mario su Google Wallet: riuscito. |
| `support.resync.failed` | warn | Risincronizzazione dal pannello non completa: il motivo è nella riga wallet.google.* della stessa richiesta. | Risincronizzazione della carta A3F2C91B del negozio Salone Mario chiesta da Enea non riuscita: il motivo è nella riga wallet.google.* della stessa richiesta; i nuovi tentativi partono da soli. |
| `support.diagnostic.enabled` | info | Modalità diagnostica attivata dal pannello interno (con scope, durata e motivo). | Enea (assistenza) ha attivato dal pannello la modalità diagnostica debug per negozio salone-mario fino al 04/11/2026 10:00 (ora italiana). Motivo: Il titolare segnala timbri che non arrivano sulla carta. |
| `support.diagnostic.disabled` | info | Modalità diagnostica spenta dal pannello interno prima della scadenza. | Enea (assistenza) ha disattivato dal pannello la modalità diagnostica per negozio salone-mario prima della scadenza (attiva dal 03/11/2026 10:00 (ora italiana); motivo: Il titolare segnala timbri che non arrivano sulla carta). |
| `support.customer.export` | info | Esportazione GDPR dei dati di un cliente (file JSON da inviare all'interessato), con il motivo. | Enea (assistenza) ha esportato i dati della carta A3F2C91B del negozio Salone Mario (5.2 KB) per una richiesta GDPR. Motivo: richiesta di accesso via email del 03/11. |
| `support.customer.delete` | info | Cancellazione GDPR di un cliente fatta dall'assistenza: dati personali tolti, storico pseudonimizzato, carta disattivata. | Enea (assistenza) ha cancellato i dati della carta A3F2C91B del negozio Salone Mario su richiesta GDPR (aveva 4 timbri e 0 premi; 7 righe di storico pseudonimizzate). Motivo: richiesta di cancellazione via email del 03/11. La carta nel wallet viene disattivata. |
| `support.member.added` | info | Persona aggiunta al team interno (accesso al pannello con 2FA), da riga di comando. | Sara (sa***@loyaltywallet.it) aggiunto al team interno da Enea: account creato con la password scelta da riga di comando. |

### shop

| Evento | Livello | Quando compare | Esempio di `msg` |
| --- | --- | --- | --- |
| `shop.created` | info | Nuovo negozio creato dal pannello interno, con il titolare invitato. | Enea (assistenza) ha creato il negozio Barberia Rossi (indirizzo /barberia-rossi) con titolare Luca (lu***@gmail.com): inviata l'email d'invito per scegliere la password. |
| `shop.suspended` | info | Negozio sospeso dall'assistenza: app esercente e pagina di iscrizione bloccate, carte disattivate su Google dal cron. | Enea (assistenza) ha sospeso il negozio Salone Mario (/salone-mario). Motivo: abbonamento non rinnovato. L'app e la pagina di iscrizione sono bloccate; le 120 carte vengono disattivate su Google entro qualche minuto. |
| `shop.reactivated` | info | Negozio riattivato dall'assistenza: app e iscrizioni di nuovo aperte, carte riattivate dal cron. | Enea (assistenza) ha riattivato il negozio Salone Mario (/salone-mario). Motivo: abbonamento rinnovato. Le 120 carte tornano attive su Google entro qualche minuto. |
| `shop.legal.updated` | info | Dati del titolare per l'informativa privacy (ragione sociale, partita IVA, email privacy) cambiati dall'assistenza. | Enea (assistenza) ha aggiornato i dati per l'informativa del negozio Salone Mario: partita IVA, email privacy. |

### log

| Evento | Livello | Quando compare | Esempio di `msg` |
| --- | --- | --- | --- |
| `log.db_sink.failed` | warn | Le righe di log non sono state copiate nel database (tabella log_events): mancheranno nella timeline della vista Assistenza, restano nel servizio di log. | 12 righe di log non copiate nel database per la vista Assistenza: fetch failed (Supabase non raggiungibile). Restano nel servizio di log esterno; se si ripete controllare Supabase. |
| `log.retention.purged` | info | Pulizia dei log copiati nel database: oltre 30 giorni (7 per quelli di modalità diagnostica). | Pulizia dei log della vista Assistenza: tolte 5000 righe più vecchie di 30 giorni e 120 righe di modalità diagnostica più vecchie di 7 giorni. |

### prepaid

| Evento | Livello | Quando compare | Esempio di `msg` |
| --- | --- | --- | --- |
| `prepaid.product.created` | info | Il titolare ha creato un tipo di tessera prepagata (es. 150 pagine) che i clienti possono richiedere. | Mario (titolare, web) ha creato la tessera «Tessera fotocopie» del negozio Cartoleria Rossi: 150 pagine, valida 12 mesi dall'attivazione. |
| `prepaid.product.updated` | info | Il titolare ha modificato un tipo di tessera (le tessere già attive non cambiano saldo). | Mario (titolare, web) ha modificato la tessera «Tessera fotocopie» del negozio Cartoleria Rossi: unità 150 → 200, scadenza nessuna → 12 mesi. |
| `prepaid.enroll.created` | info | Un cliente si è creato una tessera prepagata dal web: resta da attivare finché non paga in negozio. | Nuova tessera K7M2Q9XA (Tessera fotocopie, Cartoleria Rossi) creata dal web: da attivare in negozio dopo il pagamento. |
| `prepaid.activate.ok` | info | Tessera attivata in cassa dopo il pagamento (fuori dall'app): da qui si può usare. | Giulia (operatore, iOS 1.4.0) ha attivato la tessera K7M2Q9XA (Tessera fotocopie, Cartoleria Rossi) dopo il pagamento: 150 pagine disponibili, valida fino al 03/11/2027 10:32 (ora italiana). |
| `prepaid.consume.ok` | info | Unità scalate da una tessera prepagata. | Giulia (operatore, iOS 1.4.0) ha scalato 12 pagine dalla tessera K7M2Q9XA (Tessera fotocopie, Cartoleria Rossi): 150 → 138. |
| `prepaid.consume.rejected_inactive` | warn | Scalo rifiutato: la tessera è ancora da attivare (il cliente non l'ha pagata o non è stata attivata). | Scalo di 1 pagina di Giulia (operatore, iOS 1.4.0) rifiutato sulla tessera K7M2Q9XA (Tessera fotocopie, Cartoleria Rossi): la tessera non è ancora attiva. Se il cliente ha pagato, va attivata dalla scheda della tessera. |
| `prepaid.consume.rejected_expired` | warn | Scalo rifiutato: la tessera è scaduta. | Scalo di 2 pagine di Giulia (operatore, iOS 1.4.0) rifiutato sulla tessera K7M2Q9XA (Tessera fotocopie, Cartoleria Rossi): tessera scaduta il 01/11/2026 01:00 (ora italiana) con 40 pagine rimaste. Per usarla va ricaricata. |
| `prepaid.consume.rejected_insufficient` | warn | Scalo rifiutato: la quantità richiesta supera le unità rimaste. | Scalo di 12 pagine di Giulia (operatore, iOS 1.4.0) rifiutato sulla tessera K7M2Q9XA (Tessera fotocopie, Cartoleria Rossi): ne restano solo 5. |
| `prepaid.recharge.ok` | info | Tessera ricaricata in cassa dopo un nuovo pagamento (fuori dall'app); la scadenza riparte. | Giulia (operatore, iOS 1.4.0) ha ricaricato la tessera K7M2Q9XA (Tessera fotocopie, Cartoleria Rossi) dopo il pagamento: +150 pagine, 3 → 153. |
| `prepaid.undo.ok` | info | Annullato l'ultimo scalo di una tessera (entro 5 minuti, dalla stessa persona). | Giulia (operatore, iOS 1.4.0) ha annullato l'ultimo scalo di 12 pagine sulla tessera K7M2Q9XA (Tessera fotocopie, Cartoleria Rossi): saldo tornato a 150. |
| `prepaid.adjust.ok` | info | Il titolare ha corretto a mano il saldo di una tessera, con il motivo. | Mario (titolare, web) ha corretto il saldo della tessera K7M2Q9XA (Tessera fotocopie, Cartoleria Rossi): 138 → 140 pagine. Motivo: due pagine stampate male. |

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

### `E_RATE_LIMITED` (HTTP 429)

- **L'utente vede**: Troppe richieste in poco tempo. Attendi qualche secondo e riprova.
- **Cosa è successo**: Un utente o un indirizzo IP ha superato il numero massimo di richieste al minuto.
- **Causa probabile**: App che ripete una richiesta in loop, lettore QR che invia lo stesso codice di continuo, oppure abuso.
- **Cosa fare**: Cercare ratelimit.hit con lo stesso user_id/ip_hash. Se è un'app in loop raccogliere la diagnostica; se è abuso valutare il blocco dell'IP.

### `E_QR_OTHER_SHOP` (HTTP 404)

- **L'utente vede**: Questa carta appartiene a un altro negozio.
- **Cosa è successo**: Il QR scansionato è una carta valida, ma di un negozio diverso da quello selezionato nell'app.
- **Causa probabile**: Il cliente ha mostrato la carta di un altro negozio, oppure l'esercente ha più negozi e ha selezionato quello sbagliato.
- **Cosa fare**: Verificare il negozio selezionato nell'app; se è giusto, il cliente deve iscriversi a questo negozio.

### `E_LAST_OWNER` (HTTP 409)

- **L'utente vede**: Il negozio deve avere almeno un titolare.
- **Cosa è successo**: Tentativo di rimuovere o declassare l'unico titolare del negozio.
- **Causa probabile**: Il titolare prova a togliersi il ruolo o a rimuoversi prima di nominarne un altro.
- **Cosa fare**: Nominare prima un altro titolare, poi cambiare o rimuovere il precedente.

### `E_STAFF_NOT_FOUND` (HTTP 404)

- **L'utente vede**: Questo utente non fa parte dello staff del negozio.
- **Cosa è successo**: Operazione su un membro dello staff che non esiste in questo negozio.
- **Causa probabile**: Utente già rimosso (anche da un altro dispositivo) o lista non aggiornata nell'app.
- **Cosa fare**: Aggiornare la lista dello staff nell'app.

### `E_STAFF_ALREADY_MEMBER` (HTTP 409)

- **L'utente vede**: Questa persona fa già parte dello staff.
- **Cosa è successo**: Invito di un utente che è già nello staff del negozio.
- **Causa probabile**: Invito ripetuto.
- **Cosa fare**: Nessuna azione; per cambiare il ruolo usare la modifica del membro.

### `E_INVITE_FAILED` (HTTP 502)

- **L'utente vede**: Non è stato possibile inviare l'invito. Riprova tra qualche minuto.
- **Cosa è successo**: Supabase Auth non ha creato l'utente o non ha inviato l'email d'invito.
- **Causa probabile**: Server email non configurato o limite di invio raggiunto, oppure indirizzo email rifiutato.
- **Cosa fare**: Controllare il messaggio di Supabase nel log e la configurazione SMTP del progetto Supabase.

### `E_PROMO_WEEKLY_LIMIT` (HTTP 409)

- **L'utente vede**: Puoi inviare una sola promozione a settimana.
- **Cosa è successo**: Prenotazione di una promozione prima che siano passati 7 giorni dalla precedente.
- **Causa probabile**: Seconda promozione nella stessa settimana.
- **Cosa fare**: Il messaggio indica da quando si può inviare la prossima.

### `E_PROMO_NO_RECIPIENTS` (HTTP 409)

- **L'utente vede**: Nessun cliente ha dato il consenso a ricevere promozioni.
- **Cosa è successo**: Prenotazione di una promozione senza clienti con consenso marketing.
- **Causa probabile**: Negozio nuovo o clienti che non hanno spuntato il consenso facoltativo.
- **Cosa fare**: Nessuna azione tecnica: servono clienti con consenso marketing.

### `E_LOGO_INVALID` (HTTP 400)

- **L'utente vede**: Il logo deve essere un'immagine PNG, JPEG o WebP di massimo 2 MB.
- **Cosa è successo**: Richiesta di caricamento di un logo di tipo o dimensione non ammessi, o logo non trovato dopo il caricamento.
- **Causa probabile**: Foto troppo grande o formato HEIC dell'iPhone; oppure caricamento non completato.
- **Cosa fare**: Far ritagliare/esportare l'immagine in PNG o JPEG; se il caricamento è stato fatto, ripeterlo.

### `E_PAYLOAD_TOO_LARGE` (HTTP 413)

- **L'utente vede**: I dati inviati sono troppo grandi.
- **Cosa è successo**: Il corpo della richiesta supera la dimensione massima ammessa per l'endpoint.
- **Causa probabile**: Pacchetto di diagnostica con troppi eventi, o app non aggiornata.
- **Cosa fare**: Verificare la versione dell'app; il limite è indicato nel log.

### `E_CORS_ORIGIN` (HTTP 403)

- **L'utente vede**: Accesso non consentito da questo sito.
- **Cosa è successo**: Richiesta dal browser con un'origine non presente in MERCHANT_APP_ORIGINS.
- **Causa probabile**: Web app esercente pubblicata su un dominio nuovo non ancora configurato, oppure sito di terzi.
- **Cosa fare**: Se il dominio è nostro, aggiungerlo a MERCHANT_APP_ORIGINS e rifare il deploy.

### `E_GOOGLE_AUTH` (HTTP 502)

- **L'utente vede**: La carta nel Wallet non si è aggiornata. Il dato è salvato: si aggiornerà da sola appena possibile.
- **Cosa è successo**: Google Wallet ha rifiutato le credenziali del service account (401/403).
- **Causa probabile**: Chiave GOOGLE_WALLET_SA_KEY_B64 revocata o sbagliata, oppure il service account non è utente (Developer) dell'emittente nella Google Pay & Wallet Console.
- **Cosa fare**: Verificare la chiave GOOGLE_WALLET_SA_KEY_B64 e, nella Wallet Console → Users, che l'email del service account abbia il ruolo Developer.

### `E_GOOGLE_NOT_FOUND` (HTTP 502)

- **L'utente vede**: La carta nel Wallet non si è aggiornata. Il dato è salvato: si aggiornerà da sola appena possibile.
- **Cosa è successo**: Google Wallet non trova la carta o il template del negozio (404).
- **Causa probabile**: Template del negozio mai creato, oppure GOOGLE_WALLET_ISSUER_ID diverso da quello con cui la carta è stata creata.
- **Cosa fare**: Risincronizzare il negozio (pnpm wallet:resync --shop <slug>): ricrea template e carte mancanti. Se persiste, verificare l'Issuer ID.

### `E_GOOGLE_QUOTA` (HTTP 502)

- **L'utente vede**: La carta nel Wallet non si è aggiornata. Il dato è salvato: si aggiornerà da sola appena possibile.
- **Cosa è successo**: Superato il limite di richieste o di notifiche di Google Wallet (429).
- **Causa probabile**: Troppe richieste in poco tempo (es. risincronizzazione di molti negozi) o troppe notifiche alla stessa carta.
- **Cosa fare**: Nessuna azione immediata: i tentativi automatici riprovano. Se è frequente, ridurre gli invii o chiedere più quota a Google.

### `E_GOOGLE_INVALID_PAYLOAD` (HTTP 502)

- **L'utente vede**: La carta nel Wallet non si è aggiornata. Il dato è salvato: lo segnaleremo all'assistenza.
- **Cosa è successo**: Google Wallet ha rifiutato i dati della carta o del template (400).
- **Causa probabile**: Logo non raggiungibile o non PNG/JPEG, colore o testi non validi per Google, oppure un bug nei dati inviati.
- **Cosa fare**: Leggere la risposta di Google nel log (provider_response): indica il campo rifiutato. Correggere le impostazioni del negozio o segnalare allo sviluppo.

### `E_GOOGLE_UNAVAILABLE` (HTTP 502)

- **L'utente vede**: La carta nel Wallet non si è aggiornata. Il dato è salvato: si aggiornerà da sola appena possibile.
- **Cosa è successo**: Google Wallet non risponde o risponde con un errore interno (5xx, timeout, rete).
- **Causa probabile**: Disservizio temporaneo di Google.
- **Cosa fare**: Nessuna azione: i tentativi automatici riprovano. Controllare lo stato dei servizi Google se dura più di un'ora.

### `E_CRON_UNAUTHORIZED` (HTTP 401)

- **L'utente vede**: Non autorizzato.
- **Cosa è successo**: Chiamata all'endpoint del cron senza il segreto corretto.
- **Causa probabile**: CRON_SECRET diverso tra l'app e il Vault di Supabase, oppure chiamata non nostra.
- **Cosa fare**: Riallineare il segreto con `pnpm cron:configure` (vedi README). Se le chiamate non sono nostre, ruotare CRON_SECRET.

### `E_CAPTCHA_FAILED` (HTTP 400)

- **L'utente vede**: Non siamo riusciti a verificare che tu non sia un robot. Ricarica la pagina e riprova.
- **Cosa è successo**: Il controllo anti-bot (Cloudflare Turnstile) non è stato superato prima dell'invio dell'SMS.
- **Causa probabile**: Pagina aperta da troppo tempo (verifica scaduta), blocco di contenuti nel browser, oppure un bot.
- **Cosa fare**: Far ricaricare la pagina. Se succede a molti clienti veri, verificare le chiavi Turnstile (NEXT_PUBLIC_TURNSTILE_SITE_KEY, TURNSTILE_SECRET_KEY).

### `E_PHONE_INVALID` (HTTP 400)

- **L'utente vede**: Controlla il numero di cellulare.
- **Cosa è successo**: Numero di telefono non valido per l'iscrizione: serve un cellulare italiano (+39 3…).
- **Causa probabile**: Numero incompleto, fisso o estero.
- **Cosa fare**: Nessuna azione: il messaggio sotto il campo spiega al cliente cosa correggere.

### `E_OTP_SEND_FAILED` (HTTP 502)

- **L'utente vede**: Non siamo riusciti a inviare l'SMS. Riprova tra qualche minuto.
- **Cosa è successo**: Il fornitore SMS (Twilio Verify) non ha inviato il codice di verifica.
- **Causa probabile**: Credenziali Twilio errate, credito esaurito, numero rifiutato da Twilio o disservizio.
- **Cosa fare**: Leggere la risposta di Twilio nel log (provider_response). Controllare credito e credenziali (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_VERIFY_SERVICE_SID).

### `E_OTP_RESEND_TOO_SOON` (HTTP 429)

- **L'utente vede**: Aspetta qualche secondo prima di chiedere un nuovo codice.
- **Cosa è successo**: Richiesta di un nuovo codice prima dei 60 secondi dal precedente.
- **Causa probabile**: Doppio tocco o pagina che non mostra il conto alla rovescia.
- **Cosa fare**: Nessuna azione.

### `E_OTP_LIMIT` (HTTP 429)

- **L'utente vede**: Troppi codici richiesti per questo numero. Riprova più tardi.
- **Cosa è successo**: Superato il limite di SMS per numero (3 all'ora, 5 al giorno) o per IP (10 all'ora), o numero bloccato.
- **Causa probabile**: Cliente che riprova molte volte, numero bloccato dopo 5 codici sbagliati, oppure tentativo di abuso (SMS pumping).
- **Cosa fare**: Il log enroll.otp.limited dice quale limite. Se è un cliente vero, può riprovare dopo il tempo indicato; molti blocchi per IP diversi = possibile abuso.

### `E_OTP_WRONG_CODE` (HTTP 400)

- **L'utente vede**: Codice non corretto.
- **Cosa è successo**: Il codice di verifica inserito non è quello inviato via SMS.
- **Causa probabile**: Errore di battitura o codice di un SMS precedente.
- **Cosa fare**: Nessuna azione: il cliente ha altri tentativi (il messaggio dice quanti).

### `E_OTP_TOO_MANY_ATTEMPTS` (HTTP 429)

- **L'utente vede**: Troppi codici sbagliati: il numero è bloccato per 15 minuti.
- **Cosa è successo**: Cinque codici sbagliati: iscrizione annullata e numero bloccato per 15 minuti.
- **Causa probabile**: Cliente che non trova l'SMS giusto, oppure tentativo di indovinare il codice.
- **Cosa fare**: Far riprovare dopo 15 minuti, controllando che il numero sia giusto.

### `E_OTP_EXPIRED` (HTTP 410)

- **L'utente vede**: La verifica è scaduta. Ricomincia l'iscrizione.
- **Cosa è successo**: Iscrizione in corso scaduta (15 minuti) o già completata.
- **Causa probabile**: Pagina lasciata aperta a lungo, o pulsante premuto due volte dopo il completamento.
- **Cosa fare**: Far ricominciare dal QR del bancone.

### `E_LINK_INVALID` (HTTP 410)

- **L'utente vede**: Questo link non è più valido.
- **Cosa è successo**: Link firmato (disiscrizione o apertura della carta) scaduto, già usato o manomesso.
- **Causa probabile**: Link vecchio, copiato male, oppure link di disiscrizione già usato.
- **Cosa fare**: Per la disiscrizione: il cliente è già disiscritto o può chiederlo in negozio. Per la carta: rifare l'iscrizione con lo stesso numero.

### `E_CONSENT_BY_CUSTOMER_ONLY` (HTTP 409)

- **L'utente vede**: Il consenso alle promozioni lo dà solo il cliente, iscrivendosi. Dall'app si può solo revocare.
- **Cosa è successo**: Lo staff ha provato ad attivare il consenso marketing di un cliente.
- **Causa probabile**: App non aggiornata, o tentativo di iscrivere alle promozioni un cliente che non l'ha chiesto.
- **Cosa fare**: Spiegare al titolare che il consenso deve darlo il cliente: può riaprire la pagina di iscrizione con lo stesso numero e spuntare le promozioni.

### `E_NETWORK` (HTTP 503)

- **L'utente vede**: Il server non risponde. Controlla la connessione e riprova.
- **Cosa è successo**: L'app non è riuscita a contattare il server (nessuna risposta, timeout o DNS).
- **Causa probabile**: Rete del negozio instabile, Wi-Fi senza internet, oppure server non raggiungibile.
- **Cosa fare**: Chiedere se altri siti funzionano. Se la rete va, cercare nei log del backend il request_id dell'evento app.api.error: se manca, la richiesta non è mai arrivata.

### `E_OFFLINE` (HTTP 503)

- **L'utente vede**: Sei offline: questa azione richiede la connessione.
- **Cosa è successo**: Azione bloccata dall'app perché il dispositivo risulta senza rete.
- **Causa probabile**: Dispositivo senza connessione (modalità aereo, Wi-Fi spento o senza segnale).
- **Cosa fare**: Far riconnettere il dispositivo. Gli eventi app.offline e app.online nella diagnostica dicono quando e per quanto.

### `E_BAD_RESPONSE` (HTTP 502)

- **L'utente vede**: Il server ha risposto in modo inatteso. Aggiorna l'app e riprova.
- **Cosa è successo**: La risposta del server non rispetta il contratto dell'API (schema zod) atteso dall'app.
- **Causa probabile**: App non aggiornata rispetto al backend, oppure un proxy o una rete che restituisce una pagina diversa.
- **Cosa fare**: Verificare la versione dell'app nella diagnostica e aggiornarla. Se è all'ultima versione, segnalare allo sviluppo con il request_id.

### `E_LOGIN_FAILED` (HTTP 401)

- **L'utente vede**: Email o password non corrette.
- **Cosa è successo**: Il login dello staff è stato rifiutato da Supabase Auth.
- **Causa probabile**: Password sbagliata, email diversa da quella dell'invito, oppure invito mai accettato.
- **Cosa fare**: Far usare "Password dimenticata?". Se l'invito non è mai stato accettato, il titolare può reinviarlo dalla sezione Staff.

### `E_SESSION_EXPIRED` (HTTP 401)

- **L'utente vede**: La sessione è scaduta. Accedi di nuovo.
- **Cosa è successo**: L'app non è riuscita a rinnovare il token di accesso e ha chiuso la sessione.
- **Causa probabile**: App rimasta chiusa a lungo, password cambiata su un altro dispositivo o utente rimosso dallo staff.
- **Cosa fare**: Far rifare il login. Se succede subito dopo ogni login, raccogliere la diagnostica dell'app.

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

### `E_SUPPORT_UNAUTHORIZED` (HTTP 401)

- **L'utente vede**: Accedi al pannello interno per continuare.
- **Cosa è successo**: Richiesta al pannello interno senza una sessione valida (mai entrati, sessione scaduta o uscita).
- **Causa probabile**: Sessione di 12 ore scaduta, cookie cancellati o link del pannello aperto da un altro browser.
- **Cosa fare**: Rientrare da /interno/accesso. Se succede subito dopo l'accesso, controllare che il browser accetti i cookie.

### `E_SUPPORT_FORBIDDEN` (HTTP 403)

- **L'utente vede**: Questo account non fa parte del team interno.
- **Cosa è successo**: Un account autenticato ha provato a usare il pannello interno ma non è nel team (support_members).
- **Causa probabile**: Account di un esercente usato per errore sul pannello, oppure membro del team disattivato.
- **Cosa fare**: Verificare in support_members (user_id nel log). Per aggiungere un membro: pnpm support:add <email> --name <nome> --by <chi>.

### `E_SUPPORT_MFA_REQUIRED` (HTTP 403)

- **L'utente vede**: Inserisci il codice dell'app di autenticazione per continuare.
- **Cosa è successo**: Membro del team entrato con la password ma senza il secondo fattore (codice TOTP) verificato.
- **Causa probabile**: Accesso interrotto prima del codice, oppure app di autenticazione non ancora collegata.
- **Cosa fare**: Completare l'accesso con il codice a 6 cifre. Se il telefono con l'app è perso: rimuovere il fattore dalla dashboard Supabase (Authentication → utente → MFA) e ricollegarlo al prossimo accesso.

### `E_SUPPORT_LOGIN_FAILED` (HTTP 401)

- **L'utente vede**: Email, password o codice non corretti.
- **Cosa è successo**: Accesso al pannello interno rifiutato: credenziali o codice dell'app di autenticazione sbagliati.
- **Causa probabile**: Password errata, codice scaduto (vale 30 secondi) o orologio del telefono non sincronizzato.
- **Cosa fare**: Riprovare con un codice nuovo. Se l'errore si ripete con il codice giusto, controllare l'ora automatica del telefono.

### `E_SHOP_SLUG_TAKEN` (HTTP 409)

- **L'utente vede**: Questo indirizzo è già usato o non è disponibile: scegline un altro.
- **Cosa è successo**: Creazione di un negozio con uno slug già usato da un altro negozio o riservato a una pagina del sito.
- **Causa probabile**: Negozio già creato in precedenza, oppure slug come «interno» o «api» che sono percorsi del sito.
- **Cosa fare**: Cercare il negozio con quello slug nel pannello; se è un doppione usare quello esistente, altrimenti cambiare slug.

### `E_PREPAID_NOT_ACTIVE` (HTTP 409)

- **L'utente vede**: La tessera non è ancora attiva: attivala dopo che il cliente ha pagato.
- **Cosa è successo**: Operazione su una tessera prepagata ancora da attivare (scalo, ricarica o correzione).
- **Causa probabile**: Il cliente si è creato la tessera ma non l'ha ancora pagata in negozio, oppure si è saltata l'attivazione.
- **Cosa fare**: Se il cliente ha pagato, dalla scheda della tessera usare «Attiva (pagamento ricevuto)», poi ripetere l'operazione.

### `E_PREPAID_ALREADY_ACTIVE` (HTTP 409)

- **L'utente vede**: Questa tessera è già attiva: per aggiungere unità usa «Ricarica».
- **Cosa è successo**: Richiesta di attivazione su una tessera già attivata in precedenza.
- **Causa probabile**: Doppia attivazione (due persone in cassa o doppio tocco su dispositivi diversi), oppure si voleva ricaricare.
- **Cosa fare**: Controllare il saldo nella scheda della tessera: se il cliente ha pagato di nuovo, usare «Ricarica»; altrimenti nessuna azione.

### `E_PREPAID_INSUFFICIENT` (HTTP 409)

- **L'utente vede**: Unità insufficienti sulla tessera: scala al massimo il saldo rimasto o ricaricala.
- **Cosa è successo**: Scalo rifiutato perché la quantità richiesta supera le unità rimaste sulla tessera.
- **Causa probabile**: Quantità digitata male, oppure tessera quasi esaurita che il cliente deve ricaricare.
- **Cosa fare**: Il saldo rimasto è nel messaggio: scalare al massimo quel numero o, se il cliente paga, ricaricare la tessera e ripetere.

### `E_PREPAID_EXPIRED` (HTTP 409)

- **L'utente vede**: Tessera scaduta: per usarla di nuovo va ricaricata.
- **Cosa è successo**: Scalo rifiutato perché la tessera ha superato la sua scadenza.
- **Causa probabile**: Tessera con durata (es. 12 mesi) non ricaricata entro la scadenza.
- **Cosa fare**: Se il negozio vuole concedere le unità rimaste, il titolare può ricaricarla (la scadenza riparte) o correggere il saldo; altrimenti è il comportamento previsto.

### `E_PREPAID_PRODUCT_NOT_FOUND` (HTTP 404)

- **L'utente vede**: Questa tessera non è (più) disponibile in questo negozio.
- **Cosa è successo**: Tipo di tessera inesistente, di un altro negozio o disattivato dal titolare.
- **Causa probabile**: QR o link di una tessera disattivata o cancellata, oppure indirizzo scritto male.
- **Cosa fare**: Controllare nell'app (sezione Tessere) che il tipo di tessera esista e sia attivo; se va riattivato lo fa il titolare.

<!-- FINE SEZIONE GENERATA -->
