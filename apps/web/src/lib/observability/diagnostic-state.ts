import { LEVELS, type LogContext } from "@loyalty/shared/logger";
import type { DiagnosticScopeType, LogLevel } from "@loyalty/shared/logging/events";

/** Una riga attiva di `diagnostic_modes` (vedi la migrazione diagnostic_modes). */
export interface DiagnosticMode {
  id: string;
  scope_type: DiagnosticScopeType;
  scope_id: string;
  scope_label: string;
  level: "debug" | "trace";
  reason: string;
  enabled_by: string;
  enabled_at: string;
  expires_at: string;
}

/**
 * Modalità diagnostiche attive, tenute in memoria e aggiornate da `refreshDiagnosticModes`
 * (al massimo ogni 30 secondi). Lettura sincrona: la usa il logger per ogni riga.
 */
let active: readonly DiagnosticMode[] = [];

export function setActiveDiagnosticModes(modes: readonly DiagnosticMode[]): void {
  active = modes;
}

function matches(mode: DiagnosticMode, ctx: LogContext): boolean {
  switch (mode.scope_type) {
    case "shop":
      return ctx.shop_id === mode.scope_id;
    case "staff_user":
      return ctx.user_id === mode.scope_id;
    case "customer":
      // nei log customer_ref è il codice breve della carta, salvato come scope_label
      return ctx.customer_ref === mode.scope_label;
  }
}

/** Livello minimo per il contesto: quello di base, oppure debug/trace se una modalità attiva lo riguarda. */
export function diagnosticLevelFor(ctx: LogContext, base: LogLevel, now: number = Date.now()): LogLevel {
  let level = base;
  for (const mode of active) {
    if (Date.parse(mode.expires_at) > now && matches(mode, ctx) && LEVELS[mode.level] < LEVELS[level]) {
      level = mode.level;
    }
  }
  return level;
}
