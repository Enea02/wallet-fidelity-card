import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireEnv } from "./env";

let admin: SupabaseClient | null = null;

/** Client con service role: SOLO lato server, bypassa RLS. */
export function supabaseAdmin(): SupabaseClient {
  if (!admin) {
    admin = createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return admin;
}
