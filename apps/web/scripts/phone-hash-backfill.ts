/**
 * Calcola l'hash del telefono (HMAC con IP_HASH_SALT, lo stesso dell'iscrizione) per le carte che
 * non lo hanno ancora, così la vista Assistenza le trova cercando il numero. Si lancia una volta
 * dopo la migrazione della Fase 9; rilanciarlo non cambia nulla.
 *
 *   pnpm support:phone-hash
 *
 * Usa le variabili di apps/web/.env.local (in produzione: quelle dell'ambiente).
 */
import { phoneHash } from "@/lib/public/links";
import { supabaseAdmin } from "@/lib/supabase";

const PAGE = 500;

async function main() {
  const db = supabaseAdmin();
  let total = 0;
  for (;;) {
    const { data, error } = await db
      .from("customers")
      .select("id, phone")
      .is("phone_hash", null)
      .not("phone", "is", null)
      .limit(PAGE);
    if (error) throw error;
    const rows = (data ?? []) as Array<{ id: string; phone: string }>;
    if (rows.length === 0) break;
    const items = rows.map((r) => ({ id: r.id, phone_hash: phoneHash(r.phone) }));
    const { data: n, error: rpcError } = await db.rpc("set_customer_phone_hashes", { p_items: items });
    if (rpcError) throw rpcError;
    total += Number(n);
    if (rows.length < PAGE) break;
  }
  console.log(`✔ Hash del telefono calcolato per ${total} carte.`);
}

await main();
