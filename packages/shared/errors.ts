/**
 * Catalogo degli errori. Ogni errore ha un codice stabile che compare nei log,
 * nelle risposte API e (in forma comprensibile) nelle app.
 * Fase 0: solo gli errori di configurazione; la Fase 1 completa il catalogo.
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

/** Errore applicativo con codice del catalogo. Il contesto non deve mai contenere segreti. */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly context: Readonly<Record<string, unknown>>;

  constructor(code: ErrorCode, message: string, context: Record<string, unknown> = {}) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.context = context;
  }

  get def(): ErrorDef {
    return errors[this.code];
  }
}
