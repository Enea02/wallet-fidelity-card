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
