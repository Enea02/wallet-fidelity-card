import "server-only";
import { AppError } from "@loyalty/shared/errors";
import { setContext } from "./observability/context";
import { supabaseAdmin } from "./supabase";

function bearerToken(req: Request): string {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) throw new AppError("E_AUTH_REQUIRED", "richiesta senza header Authorization: Bearer");
  return token;
}

/** Verifica il bearer token Supabase e restituisce l'utente; arricchisce il contesto di log. */
async function authenticate(req: Request): Promise<string> {
  const { data, error } = await supabaseAdmin().auth.getUser(bearerToken(req));
  if (error || !data.user) {
    throw new AppError("E_AUTH_INVALID", `token rifiutato da Supabase Auth: ${error?.message ?? "utente assente"}`);
  }
  setContext({ user_id: data.user.id, role: "staff" });
  return data.user.id;
}

/**
 * Verifica il bearer token Supabase dello staff e che l'utente
 * sia abilitato sul negozio indicato. Ritorna l'id utente.
 */
export async function requireStaff(req: Request, shopId: string): Promise<string> {
  const userId = await authenticate(req);
  setContext({ shop_id: shopId });

  const { data: link, error } = await supabaseAdmin()
    .from("staff")
    .select("shop_id")
    .eq("user_id", userId)
    .eq("shop_id", shopId)
    .maybeSingle();
  if (error) throw error;
  if (!link) {
    throw new AppError("E_FORBIDDEN_SHOP", `l'utente ${userId} non è abilitato sul negozio ${shopId}`, {
      user_id: userId,
      shop_id: shopId,
    });
  }
  return userId;
}

/** Negozi su cui l'utente staff è abilitato (per la PWA). */
export async function staffShops(req: Request) {
  const userId = await authenticate(req);
  const { data: rows, error } = await supabaseAdmin()
    .from("staff")
    .select("shops(id, slug, name, stamps_required, reward_label)")
    .eq("user_id", userId);
  if (error) throw error;
  return rows?.map((r) => r.shops).flat() ?? [];
}
