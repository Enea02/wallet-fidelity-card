import "server-only";
import { supabaseAdmin } from "./supabase";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Verifica il bearer token Supabase dello staff e che l'utente
 * sia abilitato sul negozio indicato. Ritorna l'id utente.
 */
export async function requireStaff(req: Request, shopId: string): Promise<string> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) throw new HttpError(401, "Login richiesto");

  const db = supabaseAdmin();
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, "Sessione non valida");

  const { data: link } = await db
    .from("staff")
    .select("shop_id")
    .eq("user_id", data.user.id)
    .eq("shop_id", shopId)
    .maybeSingle();
  if (!link) throw new HttpError(403, "Utente non abilitato su questo negozio");

  return data.user.id;
}

/** Negozi su cui l'utente staff è abilitato (per la PWA). */
export async function staffShops(req: Request) {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) throw new HttpError(401, "Login richiesto");

  const db = supabaseAdmin();
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, "Sessione non valida");

  const { data: rows, error: e2 } = await db
    .from("staff")
    .select("shops(id, slug, name, stamps_required, reward_label)")
    .eq("user_id", data.user.id);
  if (e2) throw new HttpError(500, e2.message);
  return rows?.map((r) => r.shops).flat() ?? [];
}

export function errorResponse(err: unknown): Response {
  if (err instanceof HttpError) {
    return Response.json({ error: err.message }, { status: err.status });
  }
  // eslint-disable-next-line no-console -- sostituito dal logger del catalogo in Fase 1
  console.error(err);
  return Response.json({ error: "Errore interno" }, { status: 500 });
}
