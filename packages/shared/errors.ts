/**
 * Catalogo degli errori. Ogni errore ha un codice stabile che compare nei log,
 * nelle risposte API (`{ error: { code, message, support_code } }`) e nelle app.
 * `userMessage` è per chi usa il prodotto; descrizione, causa e azione sono per l'assistenza
 * (finiscono nel runbook generato e nella vista Assistenza).
 */
export interface ErrorDef {
  /** Status HTTP da restituire quando l'errore arriva a una risposta API. */
  status: number;
  /** Messaggio mostrato all'utente finale o all'esercente. */
  userMessage: string;
  /** Cosa è successo, per l'assistenza. */
  description: string;
  /** Causa più probabile, per l'assistenza. */
  probableCause: string;
  /** Cosa fare, per l'assistenza. */
  action: string;
}

export const errors = {
  E_INTERNAL: {
    status: 500,
    userMessage: "Si è verificato un errore imprevisto. Riprova; se succede ancora comunica il codice all'assistenza.",
    description: "Eccezione non prevista dal codice durante una richiesta.",
    probableCause: "Bug nel codice o dato inatteso nel database.",
    action:
      "Cercare la riga http.request.failed con lo stesso request_id: contiene lo stack. Aprire una segnalazione per lo sviluppo con stack e request_id.",
  },
  E_DB: {
    status: 500,
    userMessage: "Il servizio non riesce a leggere o salvare i dati. Riprova tra poco.",
    description: "Il database (Supabase/Postgres) ha restituito un errore inatteso.",
    probableCause: "Supabase non raggiungibile o sovraccarico, migrazione non applicata, vincolo del database violato.",
    action:
      "Controllare lo stato di Supabase (status.supabase.com) e che le migrazioni siano applicate; il messaggio dell'errore nel log indica tabella o vincolo.",
  },
  E_VALIDATION: {
    status: 400,
    userMessage: "Alcuni dati non sono validi. Controlla e riprova.",
    description: "La richiesta contiene dati mancanti o nel formato sbagliato.",
    probableCause: "Campo compilato male dall'utente, oppure app/pagina non aggiornata che invia un formato vecchio.",
    action: "Il log indica il campo errato. Se è un'app, verificare che sia all'ultima versione.",
  },
  E_AUTH_REQUIRED: {
    status: 401,
    userMessage: "Devi accedere per continuare.",
    description: "Richiesta a un'API riservata allo staff senza token di accesso.",
    probableCause: "Sessione non ancora aperta o app che non invia il token.",
    action: "Far rifare il login. Se si ripete subito dopo il login, raccogliere la diagnostica dell'app.",
  },
  E_AUTH_INVALID: {
    status: 401,
    userMessage: "La sessione è scaduta. Accedi di nuovo.",
    description: "Il token di accesso inviato non è valido o è scaduto.",
    probableCause: "Sessione scaduta, utente eliminato o password cambiata su un altro dispositivo.",
    action: "Far rifare il login. Se l'utente è stato rimosso dallo staff è il comportamento atteso.",
  },
  E_FORBIDDEN_SHOP: {
    status: 403,
    userMessage: "Il tuo utente non è abilitato su questo negozio.",
    description: "Un utente autenticato ha chiesto un'operazione su un negozio a cui non è associato.",
    probableCause: "Utente staff non ancora aggiunto al negozio, oppure app che usa il negozio sbagliato.",
    action: "Verificare nella tabella staff l'associazione utente-negozio (user_id e shop_id sono nel log).",
  },
  E_ADMIN_UNAUTHORIZED: {
    status: 401,
    userMessage: "Non autorizzato.",
    description: "Chiamata a un'API di amministrazione con token admin assente o errato.",
    probableCause: "ADMIN_SETUP_TOKEN sbagliato nello script o nella chiamata, oppure tentativo di accesso non nostro.",
    action:
      "Usare il valore di ADMIN_SETUP_TOKEN dell'ambiente giusto. Se le richieste non sono nostre, ruotare il token.",
  },
  E_SHOP_NOT_FOUND: {
    status: 404,
    userMessage: "Negozio non trovato.",
    description: "Lo slug del negozio richiesto non esiste.",
    probableCause: "QR o link stampato con uno slug sbagliato, oppure negozio rinominato o eliminato.",
    action: "Confrontare lo slug nel log con la tabella shops e ristampare il cartello se serve.",
  },
  E_CARD_NOT_FOUND: {
    status: 404,
    userMessage: "Carta non trovata per questo negozio.",
    description: "Il QR scansionato non corrisponde a nessuna carta del negozio dello staff.",
    probableCause: "QR di un altro negozio, carta di un cliente cancellato, oppure lettura del QR incompleta.",
    action:
      "Far riscansionare. Se si ripete, cercare la carta per codice breve e verificare a quale negozio appartiene.",
  },
  E_PRIVACY_CONSENT_REQUIRED: {
    status: 400,
    userMessage: "Per ottenere la carta devi accettare l'informativa privacy.",
    description: "Iscrizione inviata senza il consenso privacy obbligatorio.",
    probableCause: "Casella non spuntata, oppure pagina di iscrizione vecchia in cache.",
    action: "Nessuna azione: il cliente deve spuntare il consenso.",
  },
  E_NO_REWARD: {
    status: 409,
    userMessage: "Il cliente non ha premi da riscattare.",
    description: "Richiesta di riscatto su una carta con zero premi disponibili.",
    probableCause: "Premio già riscattato (anche da un altro operatore) o doppio tocco sul pulsante.",
    action: "Controllare lo storico della carta: l'ultimo riscatto indica chi e quando.",
  },
  E_STAMP_COOLDOWN: {
    status: 409,
    userMessage: "Timbro già dato da poco a questa carta. Riprova più tardi.",
    description:
      "Timbro rifiutato perché dall'ultimo timbro della carta non è passato il tempo minimo impostato dal negozio.",
    probableCause: "Doppia scansione dello stesso cliente, oppure cliente che torna nello stesso giorno.",
    action:
      "Normale se era una doppia scansione. Se il cliente ha davvero diritto al timbro, il titolare può rettificare il saldo o ridurre il tempo minimo nelle impostazioni.",
  },
  E_UNDO_EXPIRED: {
    status: 409,
    userMessage: "Il timbro si può annullare solo nei 5 minuti successivi.",
    description: "Annullamento rifiutato: l'ultimo timbro è stato dato più di 5 minuti fa.",
    probableCause: "Errore accorgersi tardi del timbro sbagliato.",
    action: "Il titolare può correggere con una rettifica del saldo, indicando il motivo.",
  },
  E_UNDO_OTHER_OPERATOR: {
    status: 403,
    userMessage: "Puoi annullare solo un timbro che hai dato tu.",
    description: "Annullamento rifiutato: l'ultimo timbro della carta è stato dato da un altro operatore.",
    probableCause: "Due operatori sulla stessa carta, o dispositivo condiviso con utenti diversi.",
    action: "Far annullare a chi ha dato il timbro (entro 5 minuti) oppure rettifica del titolare.",
  },
  E_UNDO_NOT_LAST: {
    status: 409,
    userMessage: "Dopo questo timbro la carta è già stata modificata: non si può più annullare.",
    description: "Annullamento rifiutato: dopo l'ultimo timbro c'è stata un'altra operazione (riscatto o rettifica).",
    probableCause: "Timbro seguito subito da un riscatto o da una rettifica.",
    action: "Il titolare può correggere con una rettifica del saldo, indicando il motivo.",
  },
  E_UNDO_REWARD_REDEEMED: {
    status: 409,
    userMessage: "Questo timbro ha sbloccato un premio già riscattato: non si può annullare.",
    description: "Annullamento rifiutato: il timbro ha completato la carta e il premio è già stato riscattato.",
    probableCause: "Timbro dato per errore e premio consegnato subito dopo.",
    action: "Valutare con il titolare una rettifica del saldo, indicando il motivo.",
  },
  E_NOTHING_TO_UNDO: {
    status: 409,
    userMessage: "Non ci sono timbri da annullare su questa carta.",
    description: "Annullamento chiesto su una carta senza timbri annullabili.",
    probableCause: 'Doppio tocco su "Annulla" o timbro già annullato.',
    action: "Nessuna azione: controllare lo storico della carta se il cliente contesta il saldo.",
  },
  E_FORBIDDEN_ROLE: {
    status: 403,
    userMessage: "Questa operazione è riservata al titolare del negozio.",
    description:
      "Un utente dello staff ha tentato un'operazione permessa solo al titolare (rettifica, cancellazione, consensi).",
    probableCause: "Operatore che usa una funzione del titolare, oppure ruolo assegnato in modo sbagliato.",
    action: "Verificare il ruolo dell'utente nella tabella staff; se deve essere titolare, cambiarlo.",
  },
  E_CARD_DELETED: {
    status: 410,
    userMessage: "Questa carta è stata cancellata su richiesta del cliente.",
    description: "Operazione su una carta il cui cliente è stato cancellato (dati personali rimossi).",
    probableCause: "Il cliente mostra una carta vecchia ancora nel Wallet dopo la cancellazione.",
    action: "Il cliente può iscriversi di nuovo dal QR del bancone: riceverà una carta nuova.",
  },
  E_SHOP_SUSPENDED: {
    status: 403,
    userMessage: "Il negozio è momentaneamente sospeso: timbri e premi non sono disponibili.",
    description: "Operazione su un negozio con stato sospeso.",
    probableCause: "Abbonamento non pagato o sospensione manuale dal pannello interno.",
    action: "Verificare lo stato dell'abbonamento del negozio e riattivarlo se è tutto in regola.",
  },
  E_RATE_LIMITED: {
    status: 429,
    userMessage: "Troppe richieste in poco tempo. Attendi qualche secondo e riprova.",
    description: "Un utente o un indirizzo IP ha superato il numero massimo di richieste al minuto.",
    probableCause:
      "App che ripete una richiesta in loop, lettore QR che invia lo stesso codice di continuo, oppure abuso.",
    action:
      "Cercare ratelimit.hit con lo stesso user_id/ip_hash. Se è un'app in loop raccogliere la diagnostica; se è abuso valutare il blocco dell'IP.",
  },
  E_QR_OTHER_SHOP: {
    status: 404,
    userMessage: "Questa carta appartiene a un altro negozio.",
    description: "Il QR scansionato è una carta valida, ma di un negozio diverso da quello selezionato nell'app.",
    probableCause:
      "Il cliente ha mostrato la carta di un altro negozio, oppure l'esercente ha più negozi e ha selezionato quello sbagliato.",
    action: "Verificare il negozio selezionato nell'app; se è giusto, il cliente deve iscriversi a questo negozio.",
  },
  E_LAST_OWNER: {
    status: 409,
    userMessage: "Il negozio deve avere almeno un titolare.",
    description: "Tentativo di rimuovere o declassare l'unico titolare del negozio.",
    probableCause: "Il titolare prova a togliersi il ruolo o a rimuoversi prima di nominarne un altro.",
    action: "Nominare prima un altro titolare, poi cambiare o rimuovere il precedente.",
  },
  E_STAFF_NOT_FOUND: {
    status: 404,
    userMessage: "Questo utente non fa parte dello staff del negozio.",
    description: "Operazione su un membro dello staff che non esiste in questo negozio.",
    probableCause: "Utente già rimosso (anche da un altro dispositivo) o lista non aggiornata nell'app.",
    action: "Aggiornare la lista dello staff nell'app.",
  },
  E_STAFF_ALREADY_MEMBER: {
    status: 409,
    userMessage: "Questa persona fa già parte dello staff.",
    description: "Invito di un utente che è già nello staff del negozio.",
    probableCause: "Invito ripetuto.",
    action: "Nessuna azione; per cambiare il ruolo usare la modifica del membro.",
  },
  E_INVITE_FAILED: {
    status: 502,
    userMessage: "Non è stato possibile inviare l'invito. Riprova tra qualche minuto.",
    description: "Supabase Auth non ha creato l'utente o non ha inviato l'email d'invito.",
    probableCause: "Server email non configurato o limite di invio raggiunto, oppure indirizzo email rifiutato.",
    action: "Controllare il messaggio di Supabase nel log e la configurazione SMTP del progetto Supabase.",
  },
  E_PROMO_WEEKLY_LIMIT: {
    status: 409,
    userMessage: "Puoi inviare una sola promozione a settimana.",
    description: "Prenotazione di una promozione prima che siano passati 7 giorni dalla precedente.",
    probableCause: "Seconda promozione nella stessa settimana.",
    action: "Il messaggio indica da quando si può inviare la prossima.",
  },
  E_PROMO_NO_RECIPIENTS: {
    status: 409,
    userMessage: "Nessun cliente ha dato il consenso a ricevere promozioni.",
    description: "Prenotazione di una promozione senza clienti con consenso marketing.",
    probableCause: "Negozio nuovo o clienti che non hanno spuntato il consenso facoltativo.",
    action: "Nessuna azione tecnica: servono clienti con consenso marketing.",
  },
  E_LOGO_INVALID: {
    status: 400,
    userMessage: "Il logo deve essere un'immagine PNG, JPEG o WebP di massimo 2 MB.",
    description:
      "Richiesta di caricamento di un logo di tipo o dimensione non ammessi, o logo non trovato dopo il caricamento.",
    probableCause: "Foto troppo grande o formato HEIC dell'iPhone; oppure caricamento non completato.",
    action: "Far ritagliare/esportare l'immagine in PNG o JPEG; se il caricamento è stato fatto, ripeterlo.",
  },
  E_PAYLOAD_TOO_LARGE: {
    status: 413,
    userMessage: "I dati inviati sono troppo grandi.",
    description: "Il corpo della richiesta supera la dimensione massima ammessa per l'endpoint.",
    probableCause: "Pacchetto di diagnostica con troppi eventi, o app non aggiornata.",
    action: "Verificare la versione dell'app; il limite è indicato nel log.",
  },
  E_CORS_ORIGIN: {
    status: 403,
    userMessage: "Accesso non consentito da questo sito.",
    description: "Richiesta dal browser con un'origine non presente in MERCHANT_APP_ORIGINS.",
    probableCause: "Web app esercente pubblicata su un dominio nuovo non ancora configurato, oppure sito di terzi.",
    action: "Se il dominio è nostro, aggiungerlo a MERCHANT_APP_ORIGINS e rifare il deploy.",
  },
  E_GOOGLE_AUTH: {
    status: 502,
    userMessage: "La carta nel Wallet non si è aggiornata. Il dato è salvato: si aggiornerà da sola appena possibile.",
    description: "Google Wallet ha rifiutato le credenziali del service account (401/403).",
    probableCause:
      "Chiave GOOGLE_WALLET_SA_KEY_B64 revocata o sbagliata, oppure il service account non è utente (Developer) dell'emittente nella Google Pay & Wallet Console.",
    action:
      "Verificare la chiave GOOGLE_WALLET_SA_KEY_B64 e, nella Wallet Console → Users, che l'email del service account abbia il ruolo Developer.",
  },
  E_GOOGLE_NOT_FOUND: {
    status: 502,
    userMessage: "La carta nel Wallet non si è aggiornata. Il dato è salvato: si aggiornerà da sola appena possibile.",
    description: "Google Wallet non trova la carta o il template del negozio (404).",
    probableCause:
      "Template del negozio mai creato, oppure GOOGLE_WALLET_ISSUER_ID diverso da quello con cui la carta è stata creata.",
    action:
      "Risincronizzare il negozio (pnpm wallet:resync --shop <slug>): ricrea template e carte mancanti. Se persiste, verificare l'Issuer ID.",
  },
  E_GOOGLE_QUOTA: {
    status: 502,
    userMessage: "La carta nel Wallet non si è aggiornata. Il dato è salvato: si aggiornerà da sola appena possibile.",
    description: "Superato il limite di richieste o di notifiche di Google Wallet (429).",
    probableCause:
      "Troppe richieste in poco tempo (es. risincronizzazione di molti negozi) o troppe notifiche alla stessa carta.",
    action:
      "Nessuna azione immediata: i tentativi automatici riprovano. Se è frequente, ridurre gli invii o chiedere più quota a Google.",
  },
  E_GOOGLE_INVALID_PAYLOAD: {
    status: 502,
    userMessage: "La carta nel Wallet non si è aggiornata. Il dato è salvato: lo segnaleremo all'assistenza.",
    description: "Google Wallet ha rifiutato i dati della carta o del template (400).",
    probableCause:
      "Logo non raggiungibile o non PNG/JPEG, colore o testi non validi per Google, oppure un bug nei dati inviati.",
    action:
      "Leggere la risposta di Google nel log (provider_response): indica il campo rifiutato. Correggere le impostazioni del negozio o segnalare allo sviluppo.",
  },
  E_GOOGLE_UNAVAILABLE: {
    status: 502,
    userMessage: "La carta nel Wallet non si è aggiornata. Il dato è salvato: si aggiornerà da sola appena possibile.",
    description: "Google Wallet non risponde o risponde con un errore interno (5xx, timeout, rete).",
    probableCause: "Disservizio temporaneo di Google.",
    action:
      "Nessuna azione: i tentativi automatici riprovano. Controllare lo stato dei servizi Google se dura più di un'ora.",
  },
  E_CRON_UNAUTHORIZED: {
    status: 401,
    userMessage: "Non autorizzato.",
    description: "Chiamata all'endpoint del cron senza il segreto corretto.",
    probableCause: "CRON_SECRET diverso tra l'app e il Vault di Supabase, oppure chiamata non nostra.",
    action:
      "Riallineare il segreto con `pnpm cron:configure` (vedi README). Se le chiamate non sono nostre, ruotare CRON_SECRET.",
  },
  E_CAPTCHA_FAILED: {
    status: 400,
    userMessage: "Non siamo riusciti a verificare che tu non sia un robot. Ricarica la pagina e riprova.",
    description: "Il controllo anti-bot (Cloudflare Turnstile) non è stato superato prima dell'invio dell'SMS.",
    probableCause: "Pagina aperta da troppo tempo (verifica scaduta), blocco di contenuti nel browser, oppure un bot.",
    action:
      "Far ricaricare la pagina. Se succede a molti clienti veri, verificare le chiavi Turnstile (NEXT_PUBLIC_TURNSTILE_SITE_KEY, TURNSTILE_SECRET_KEY).",
  },
  E_PHONE_INVALID: {
    status: 400,
    userMessage: "Controlla il numero di cellulare.",
    description: "Numero di telefono non valido per l'iscrizione: serve un cellulare italiano (+39 3…).",
    probableCause: "Numero incompleto, fisso o estero.",
    action: "Nessuna azione: il messaggio sotto il campo spiega al cliente cosa correggere.",
  },
  E_OTP_SEND_FAILED: {
    status: 502,
    userMessage: "Non siamo riusciti a inviare l'SMS. Riprova tra qualche minuto.",
    description: "Il fornitore SMS (Twilio Verify) non ha inviato il codice di verifica.",
    probableCause: "Credenziali Twilio errate, credito esaurito, numero rifiutato da Twilio o disservizio.",
    action:
      "Leggere la risposta di Twilio nel log (provider_response). Controllare credito e credenziali (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_VERIFY_SERVICE_SID).",
  },
  E_OTP_RESEND_TOO_SOON: {
    status: 429,
    userMessage: "Aspetta qualche secondo prima di chiedere un nuovo codice.",
    description: "Richiesta di un nuovo codice prima dei 60 secondi dal precedente.",
    probableCause: "Doppio tocco o pagina che non mostra il conto alla rovescia.",
    action: "Nessuna azione.",
  },
  E_OTP_LIMIT: {
    status: 429,
    userMessage: "Troppi codici richiesti per questo numero. Riprova più tardi.",
    description:
      "Superato il limite di SMS per numero (3 all'ora, 5 al giorno) o per IP (10 all'ora), o numero bloccato.",
    probableCause:
      "Cliente che riprova molte volte, numero bloccato dopo 5 codici sbagliati, oppure tentativo di abuso (SMS pumping).",
    action:
      "Il log enroll.otp.limited dice quale limite. Se è un cliente vero, può riprovare dopo il tempo indicato; molti blocchi per IP diversi = possibile abuso.",
  },
  E_OTP_WRONG_CODE: {
    status: 400,
    userMessage: "Codice non corretto.",
    description: "Il codice di verifica inserito non è quello inviato via SMS.",
    probableCause: "Errore di battitura o codice di un SMS precedente.",
    action: "Nessuna azione: il cliente ha altri tentativi (il messaggio dice quanti).",
  },
  E_OTP_TOO_MANY_ATTEMPTS: {
    status: 429,
    userMessage: "Troppi codici sbagliati: il numero è bloccato per 15 minuti.",
    description: "Cinque codici sbagliati: iscrizione annullata e numero bloccato per 15 minuti.",
    probableCause: "Cliente che non trova l'SMS giusto, oppure tentativo di indovinare il codice.",
    action: "Far riprovare dopo 15 minuti, controllando che il numero sia giusto.",
  },
  E_OTP_EXPIRED: {
    status: 410,
    userMessage: "La verifica è scaduta. Ricomincia l'iscrizione.",
    description: "Iscrizione in corso scaduta (15 minuti) o già completata.",
    probableCause: "Pagina lasciata aperta a lungo, o pulsante premuto due volte dopo il completamento.",
    action: "Far ricominciare dal QR del bancone.",
  },
  E_LINK_INVALID: {
    status: 410,
    userMessage: "Questo link non è più valido.",
    description: "Link firmato (disiscrizione o apertura della carta) scaduto, già usato o manomesso.",
    probableCause: "Link vecchio, copiato male, oppure link di disiscrizione già usato.",
    action:
      "Per la disiscrizione: il cliente è già disiscritto o può chiederlo in negozio. Per la carta: rifare l'iscrizione con lo stesso numero.",
  },

  E_CONSENT_BY_CUSTOMER_ONLY: {
    status: 409,
    userMessage: "Il consenso alle promozioni lo dà solo il cliente, iscrivendosi. Dall'app si può solo revocare.",
    description: "Lo staff ha provato ad attivare il consenso marketing di un cliente.",
    probableCause: "App non aggiornata, o tentativo di iscrivere alle promozioni un cliente che non l'ha chiesto.",
    action:
      "Spiegare al titolare che il consenso deve darlo il cliente: può riaprire la pagina di iscrizione con lo stesso numero e spuntare le promozioni.",
  },

  // --- App esercente (errori nati nell'app, senza risposta del server) ---
  E_NETWORK: {
    status: 503,
    userMessage: "Il server non risponde. Controlla la connessione e riprova.",
    description: "L'app non è riuscita a contattare il server (nessuna risposta, timeout o DNS).",
    probableCause: "Rete del negozio instabile, Wi-Fi senza internet, oppure server non raggiungibile.",
    action:
      "Chiedere se altri siti funzionano. Se la rete va, cercare nei log del backend il request_id dell'evento app.api.error: se manca, la richiesta non è mai arrivata.",
  },
  E_OFFLINE: {
    status: 503,
    userMessage: "Sei offline: questa azione richiede la connessione.",
    description: "Azione bloccata dall'app perché il dispositivo risulta senza rete.",
    probableCause: "Dispositivo senza connessione (modalità aereo, Wi-Fi spento o senza segnale).",
    action:
      "Far riconnettere il dispositivo. Gli eventi app.offline e app.online nella diagnostica dicono quando e per quanto.",
  },
  E_BAD_RESPONSE: {
    status: 502,
    userMessage: "Il server ha risposto in modo inatteso. Aggiorna l'app e riprova.",
    description: "La risposta del server non rispetta il contratto dell'API (schema zod) atteso dall'app.",
    probableCause:
      "App non aggiornata rispetto al backend, oppure un proxy o una rete che restituisce una pagina diversa.",
    action:
      "Verificare la versione dell'app nella diagnostica e aggiornarla. Se è all'ultima versione, segnalare allo sviluppo con il request_id.",
  },
  E_LOGIN_FAILED: {
    status: 401,
    userMessage: "Email o password non corrette.",
    description: "Il login dello staff è stato rifiutato da Supabase Auth.",
    probableCause: "Password sbagliata, email diversa da quella dell'invito, oppure invito mai accettato.",
    action:
      'Far usare "Password dimenticata?". Se l\'invito non è mai stato accettato, il titolare può reinviarlo dalla sezione Staff.',
  },
  E_SESSION_EXPIRED: {
    status: 401,
    userMessage: "La sessione è scaduta. Accedi di nuovo.",
    description: "L'app non è riuscita a rinnovare il token di accesso e ha chiuso la sessione.",
    probableCause:
      "App rimasta chiusa a lungo, password cambiata su un altro dispositivo o utente rimosso dallo staff.",
    action: "Far rifare il login. Se succede subito dopo ogni login, raccogliere la diagnostica dell'app.",
  },
  E_EXTERNAL_UNAVAILABLE: {
    status: 502,
    userMessage: "Un servizio esterno non risponde. Riprova tra qualche minuto.",
    description: "Una chiamata a un servizio esterno (Google, Apple, Twilio…) è fallita per timeout o errore di rete.",
    probableCause: "Disservizio del provider o problema di rete temporaneo.",
    action:
      "Cercare la riga external.call.failed con lo stesso request_id: indica provider, endpoint e durata. Controllare la pagina di stato del provider.",
  },
  E_EXTERNAL_HTTP: {
    status: 502,
    userMessage: "Un servizio esterno ha rifiutato la richiesta. Riprova tra qualche minuto.",
    description: "Un servizio esterno ha risposto con un errore HTTP.",
    probableCause: "Credenziali scadute o revocate, quota superata, oppure dati inviati non validi per il provider.",
    action:
      "Cercare la riga external.call.failed con lo stesso request_id: contiene status HTTP e risposta del provider.",
  },
  E_CONFIG_INVALID: {
    status: 500,
    userMessage: "Il servizio non è configurato correttamente. Riprova tra qualche minuto.",
    description: "Il server non si avvia perché una o più variabili d'ambiente mancano o hanno un formato non valido.",
    probableCause:
      "Variabile non impostata nel deploy o nel file .env.local, oppure copiata male (spazi, virgolette, base64 troncato).",
    action:
      "Confrontare le variabili del deploy con .env.example dell'app indicata nel log; correggere quelle elencate e riavviare.",
  },
  E_SUPPORT_UNAUTHORIZED: {
    status: 401,
    userMessage: "Accedi al pannello interno per continuare.",
    description: "Richiesta al pannello interno senza una sessione valida (mai entrati, sessione scaduta o uscita).",
    probableCause: "Sessione di 12 ore scaduta, cookie cancellati o link del pannello aperto da un altro browser.",
    action:
      "Rientrare da /interno/accesso. Se succede subito dopo l'accesso, controllare che il browser accetti i cookie.",
  },
  E_SUPPORT_FORBIDDEN: {
    status: 403,
    userMessage: "Questo account non fa parte del team interno.",
    description: "Un account autenticato ha provato a usare il pannello interno ma non è nel team (support_members).",
    probableCause: "Account di un esercente usato per errore sul pannello, oppure membro del team disattivato.",
    action:
      "Verificare in support_members (user_id nel log). Per aggiungere un membro: pnpm support:add <email> --name <nome> --by <chi>.",
  },
  E_SUPPORT_MFA_REQUIRED: {
    status: 403,
    userMessage: "Inserisci il codice dell'app di autenticazione per continuare.",
    description: "Membro del team entrato con la password ma senza il secondo fattore (codice TOTP) verificato.",
    probableCause: "Accesso interrotto prima del codice, oppure app di autenticazione non ancora collegata.",
    action:
      "Completare l'accesso con il codice a 6 cifre. Se il telefono con l'app è perso: rimuovere il fattore dalla dashboard Supabase (Authentication → utente → MFA) e ricollegarlo al prossimo accesso.",
  },
  E_SUPPORT_LOGIN_FAILED: {
    status: 401,
    userMessage: "Email, password o codice non corretti.",
    description: "Accesso al pannello interno rifiutato: credenziali o codice dell'app di autenticazione sbagliati.",
    probableCause: "Password errata, codice scaduto (vale 30 secondi) o orologio del telefono non sincronizzato.",
    action:
      "Riprovare con un codice nuovo. Se l'errore si ripete con il codice giusto, controllare l'ora automatica del telefono.",
  },
  E_SHOP_SLUG_TAKEN: {
    status: 409,
    userMessage: "Questo indirizzo è già usato o non è disponibile: scegline un altro.",
    description:
      "Creazione di un negozio con uno slug già usato da un altro negozio o riservato a una pagina del sito.",
    probableCause: "Negozio già creato in precedenza, oppure slug come «interno» o «api» che sono percorsi del sito.",
    action:
      "Cercare il negozio con quello slug nel pannello; se è un doppione usare quello esistente, altrimenti cambiare slug.",
  },
  E_PREPAID_NOT_ACTIVE: {
    status: 409,
    userMessage: "La tessera non è ancora attiva: attivala dopo che il cliente ha pagato.",
    description: "Operazione su una tessera prepagata ancora da attivare (scalo, ricarica o correzione).",
    probableCause:
      "Il cliente si è creato la tessera ma non l'ha ancora pagata in negozio, oppure si è saltata l'attivazione.",
    action:
      "Se il cliente ha pagato, dalla scheda della tessera usare «Attiva (pagamento ricevuto)», poi ripetere l'operazione.",
  },
  E_PREPAID_ALREADY_ACTIVE: {
    status: 409,
    userMessage: "Questa tessera è già attiva: per aggiungere unità usa «Ricarica».",
    description: "Richiesta di attivazione su una tessera già attivata in precedenza.",
    probableCause:
      "Doppia attivazione (due persone in cassa o doppio tocco su dispositivi diversi), oppure si voleva ricaricare.",
    action:
      "Controllare il saldo nella scheda della tessera: se il cliente ha pagato di nuovo, usare «Ricarica»; altrimenti nessuna azione.",
  },
  E_PREPAID_INSUFFICIENT: {
    status: 409,
    userMessage: "Unità insufficienti sulla tessera: scala al massimo il saldo rimasto o ricaricala.",
    description: "Scalo rifiutato perché la quantità richiesta supera le unità rimaste sulla tessera.",
    probableCause: "Quantità digitata male, oppure tessera quasi esaurita che il cliente deve ricaricare.",
    action:
      "Il saldo rimasto è nel messaggio: scalare al massimo quel numero o, se il cliente paga, ricaricare la tessera e ripetere.",
  },
  E_PREPAID_EXPIRED: {
    status: 409,
    userMessage: "Tessera scaduta: per usarla di nuovo va ricaricata.",
    description: "Scalo rifiutato perché la tessera ha superato la sua scadenza.",
    probableCause: "Tessera con durata (es. 12 mesi) non ricaricata entro la scadenza.",
    action:
      "Se il negozio vuole concedere le unità rimaste, il titolare può ricaricarla (la scadenza riparte) o correggere il saldo; altrimenti è il comportamento previsto.",
  },
  E_PREPAID_PRODUCT_NOT_FOUND: {
    status: 404,
    userMessage: "Questa tessera non è (più) disponibile in questo negozio.",
    description: "Tipo di tessera inesistente, di un altro negozio o disattivato dal titolare.",
    probableCause: "QR o link di una tessera disattivata o cancellata, oppure indirizzo scritto male.",
    action:
      "Controllare nell'app (sezione Tessere) che il tipo di tessera esista e sia attivo; se va riattivato lo fa il titolare.",
  },
  E_POINTS_AMOUNT_INVALID: {
    status: 400,
    userMessage: "Importo non valido: scrivi l'importo dello scontrino (da 0,01 a 10.000 €).",
    description: "Punti richiesti con un importo assente, nullo o oltre 10.000 €.",
    probableCause: "Importo digitato male (virgola, zeri in più) o campo vuoto.",
    action:
      "Far riscrivere l'importo dello scontrino. Se i punti dati sono sbagliati, il titolare corregge il saldo con un motivo.",
  },
  E_POINTS_MODE_REQUIRED: {
    status: 409,
    userMessage: "Questo negozio usa la carta a timbri, non a punti.",
    description: "Operazione sui punti in un negozio la cui carta fedeltà è a timbri.",
    probableCause: "Il titolare ha cambiato modalità mentre l'app era aperta, oppure app non aggiornata.",
    action: "Controllare in Carta → modalità timbri/punti; ricaricare l'app sul dispositivo dello staff.",
  },
  E_STAMPS_MODE_REQUIRED: {
    status: 409,
    userMessage: "Questo negozio usa la carta a punti: inserisci l'importo dello scontrino.",
    description: "Timbro o premio a timbri chiesto in un negozio la cui carta fedeltà è a punti.",
    probableCause: "Il titolare è passato ai punti mentre l'app era aperta, oppure app non aggiornata.",
    action: "Ricaricare l'app sul dispositivo dello staff; controllare in Carta → modalità timbri/punti.",
  },
  E_MEMBERSHIP_NOT_RENEWABLE: {
    status: 409,
    userMessage: "Questa membership non ha scadenza: non serve rinnovarla.",
    description: "Rinnovo richiesto per una membership senza durata.",
    probableCause: "Tipo di tessera creato senza scadenza; il rinnovo non cambia nulla.",
    action:
      "Nessuna: la membership resta valida. Se il negozio vuole una durata, il titolare la imposta nella sezione Tessere.",
  },
} as const satisfies Record<string, ErrorDef>;

export type ErrorCode = keyof typeof errors;

export interface AppErrorOptions {
  /** Messaggio per l'utente più preciso di quello del catalogo (es. con il campo errato). */
  userMessage?: string;
  /** Errore originale, per lo stack nel log. */
  cause?: unknown;
}

/**
 * Errore applicativo con codice del catalogo. `message` è per i log (specifico, con i valori);
 * il contesto non deve mai contenere segreti o dati personali in chiaro.
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly context: Readonly<Record<string, unknown>>;
  readonly userMessage: string;
  /** true se l'errore è già stato registrato da un evento (di dominio o external.call.failed). */
  logged = false;

  constructor(code: ErrorCode, message: string, context: Record<string, unknown> = {}, opts: AppErrorOptions = {}) {
    super(message, opts.cause === undefined ? undefined : { cause: opts.cause });
    this.name = "AppError";
    this.code = code;
    this.context = context;
    this.userMessage = opts.userMessage ?? errors[code].userMessage;
  }

  get def(): ErrorDef {
    return errors[this.code];
  }

  get status(): number {
    return errors[this.code].status;
  }
}

export const isAppError = (e: unknown): e is AppError => e instanceof AppError;
