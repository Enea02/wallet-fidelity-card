import type { AuthDestination } from "@loyalty/shared/logging/events";
import { parseDest } from "@/lib/access-rules";

/** Parametri che il login porta da un passo all'altro: la pagina che si stava aprendo e dove tornare. */
export interface AccessParams {
  dest?: string | undefined;
  ritorno?: string | undefined;
  errore?: string | undefined;
}

export interface Carry {
  dest: AuthDestination | null;
  ritorno: string | null;
}

export function carryOf(p: AccessParams): Carry {
  const ritorno = typeof p.ritorno === "string" && p.ritorno.length <= 2000 ? p.ritorno : null;
  return { dest: parseDest(p.dest), ritorno };
}

/** "?dest=…&ritorno=…" per il passo successivo ("" se non c'è niente da portare). */
export function carryQuery(c: Carry): string {
  const q = new URLSearchParams();
  if (c.dest) q.set("dest", c.dest);
  if (c.ritorno) q.set("ritorno", c.ritorno);
  const s = q.toString();
  return s ? `?${s}` : "";
}

/** Campi nascosti del modulo con gli stessi parametri. */
export function CarryFields({ carry }: { carry: Carry }) {
  return (
    <>
      {carry.dest && <input type="hidden" name="dest" value={carry.dest} />}
      {carry.ritorno && <input type="hidden" name="ritorno" value={carry.ritorno} />}
    </>
  );
}
