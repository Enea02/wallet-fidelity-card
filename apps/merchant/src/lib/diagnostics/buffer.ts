import type { LogLine } from "@loyalty/shared/logger";

/*
 * Buffer locale degli ultimi eventi dell'app (righe già redatte dal logger), inviato con
 * "Invia diagnostica all'assistenza". Salvato su disco (AsyncStorage / localStorage) così
 * sopravvive a un crash o a un riavvio: la diagnostica mostra anche cosa è successo prima.
 */

export const BUFFER_MAX = 500;

export interface BufferStore {
  load: () => Promise<string | null>;
  save: (value: string) => Promise<void>;
}

export class EventBuffer {
  private lines: LogLine[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly store: BufferStore | null = null,
    private readonly max = BUFFER_MAX,
    private readonly saveDelayMs = 1000,
  ) {}

  /** Carica gli eventi salvati (prima di quelli già registrati in questa sessione). */
  async restore(): Promise<void> {
    if (!this.store) return;
    try {
      const raw = await this.store.load();
      const saved = raw ? (JSON.parse(raw) as unknown) : [];
      if (Array.isArray(saved)) this.lines = [...(saved as LogLine[]), ...this.lines].slice(-this.max);
    } catch {
      // buffer illeggibile: si riparte da vuoto, non è un errore per l'utente
    }
  }

  push(line: LogLine): void {
    this.lines.push(line);
    if (this.lines.length > this.max) this.lines.splice(0, this.lines.length - this.max);
    this.scheduleSave();
  }

  snapshot(): LogLine[] {
    return [...this.lines];
  }

  get size(): number {
    return this.lines.length;
  }

  /** Salva subito (es. app in background). */
  async flush(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.store) await this.store.save(JSON.stringify(this.lines)).catch(() => undefined);
  }

  private scheduleSave() {
    if (!this.store || this.timer) return;
    this.timer = setTimeout(() => void this.flush(), this.saveDelayMs);
  }
}
