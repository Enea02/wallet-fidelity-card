import { AppError } from "@loyalty/shared/errors";
import { log } from "../observability/logger";
import { supabaseAdmin } from "../supabase";

/**
 * Rate limit a finestra fissa di 60 secondi, contato in Postgres (rate_limit_hit).
 * Limiti da RATE_LIMIT_USER_PER_MIN e RATE_LIMIT_IP_PER_MIN, letti a ogni richiesta.
 */
const WINDOW_S = 60;
const DEFAULTS = { utente: 120, IP: 300 } as const;
const ENV = { utente: "RATE_LIMIT_USER_PER_MIN", IP: "RATE_LIMIT_IP_PER_MIN" } as const;

export type RateLimitScope = keyof typeof DEFAULTS;

function limitFor(scope: RateLimitScope): number {
  const v = Number(process.env[ENV[scope]]);
  return Number.isInteger(v) && v > 0 ? v : DEFAULTS[scope];
}

export async function enforceRateLimit(scope: RateLimitScope, key: string, route: string): Promise<void> {
  const limit = limitFor(scope);
  const { data, error } = await supabaseAdmin()
    .rpc("rate_limit_hit", { p_key: `${scope}:${key}`, p_limit: limit, p_window_seconds: WINDOW_S })
    .single<{ allowed: boolean; retry_after: number }>();
  if (error) throw error;
  if (data.allowed) return;

  log.event("ratelimit.hit", { route, scope, limit, window_s: WINDOW_S, retry_after_s: data.retry_after });
  const err = new AppError("E_RATE_LIMITED", `superato il limite di ${limit} richieste in ${WINDOW_S} s per ${scope}`, {
    scope,
    retry_after_s: data.retry_after,
  });
  err.logged = true;
  throw err;
}
