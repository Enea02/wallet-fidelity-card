import "server-only";
import { supabaseAdmin } from "../supabase";
import { setActiveDiagnosticModes, type DiagnosticMode } from "./diagnostic-state";
import { log } from "./logger";

const TTL_MS = 30_000;
const COLUMNS = "id, scope_type, scope_id, scope_label, level, reason, enabled_by, enabled_at, expires_at";

export interface DiagnosticStore {
  /** Modalità non disattivate e di cui non è ancora stata registrata la scadenza. */
  listOpen(): Promise<DiagnosticMode[]>;
  /** Marca come scadute (in modo atomico) quelle oltre la scadenza; restituisce solo quelle marcate ora. */
  closeExpired(): Promise<DiagnosticMode[]>;
}

export const supabaseDiagnosticStore: DiagnosticStore = {
  async listOpen() {
    const { data, error } = await supabaseAdmin()
      .from("diagnostic_modes")
      .select(COLUMNS)
      .is("disabled_at", null)
      .is("expired_logged_at", null);
    if (error) throw new Error(error.message);
    return (data ?? []) as DiagnosticMode[];
  },
  async closeExpired() {
    const { data, error } = await supabaseAdmin().rpc("close_expired_diagnostic_modes").select(COLUMNS);
    if (error) throw new Error(error.message);
    return (data ?? []) as DiagnosticMode[];
  },
};

export const diagnosticFields = (m: DiagnosticMode) => ({
  diagnostic_id: m.id,
  scope_type: m.scope_type,
  scope_id: m.scope_id,
  scope_label: m.scope_label,
  diagnostic_level: m.level,
  reason: m.reason,
  enabled_by: m.enabled_by,
  enabled_at: new Date(m.enabled_at).toISOString(),
  expires_at: new Date(m.expires_at).toISOString(),
});

let loadedAt = Number.NEGATIVE_INFINITY;
let inflight: Promise<void> | null = null;

/**
 * Aggiorna le modalità diagnostiche attive se la cache ha più di 30 secondi.
 * Le modalità scadute vengono chiuse e registrate con `diagnostic.mode.expired`:
 * la chiusura è atomica nel database, quindi la riga esce una volta sola anche con più istanze.
 * Non lancia mai: se la lettura fallisce i log restano al livello normale.
 */
export function refreshDiagnosticModes(store: DiagnosticStore = supabaseDiagnosticStore, now = Date.now()) {
  if (now - loadedAt < TTL_MS) return Promise.resolve();
  inflight ??= (async () => {
    try {
      const open = await store.listOpen();
      if (open.some((m) => Date.parse(m.expires_at) <= now)) {
        for (const m of await store.closeExpired()) log.event("diagnostic.mode.expired", diagnosticFields(m));
      }
      setActiveDiagnosticModes(open.filter((m) => Date.parse(m.expires_at) > now));
    } catch (e) {
      log.event("diagnostic.mode.read_failed", { error_message: e instanceof Error ? e.message : String(e) });
    } finally {
      loadedAt = now;
      inflight = null;
    }
  })();
  return inflight;
}

/** Solo per i test: forza la rilettura alla prossima richiesta. */
export function resetDiagnosticCache(): void {
  loadedAt = Number.NEGATIVE_INFINITY;
  setActiveDiagnosticModes([]);
}
