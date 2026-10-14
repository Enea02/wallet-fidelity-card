import "server-only";
import { fromDbError } from "../db-errors";
import { getContext } from "../observability/context";
import { supabaseAdmin } from "../supabase";

/** Chi esegue un'operazione di dominio. */
export type DomainActor =
  { type: "staff"; userId: string } | { type: "support"; name: string } | { type: "customer"; customerId: string };

/** Parametro p_meta delle funzioni Postgres: chi, da dove, con quale richiesta. */
export function domainMeta(actor: DomainActor): Record<string, unknown> {
  const ctx = getContext() ?? {};
  return {
    request_id: ctx.request_id ?? null,
    actor_type: actor.type,
    actor_id: actor.type === "staff" ? actor.userId : actor.type === "customer" ? actor.customerId : actor.name,
    platform: ctx.platform ?? null,
    app_version: ctx.app_version ?? null,
    ip_hash: ctx.ip_hash ?? null,
  };
}

export const staffMeta = (userId: string) => domainMeta({ type: "staff", userId });

/** Chiama una funzione di dominio Postgres convertendo gli errori E_… nel catalogo. */
export async function callDomain<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabaseAdmin().rpc(fn, args);
  if (error) throw fromDbError(error);
  return data as T;
}
