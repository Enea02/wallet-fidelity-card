import "server-only";
import type { DiagnosticsBody } from "@loyalty/shared/api";
import { redact } from "@loyalty/shared/logger";
import type { ActorFields } from "@loyalty/shared/logging/events";
import type { z } from "zod";
import { getContext } from "../observability/context";
import { log } from "../observability/logger";
import { supabaseAdmin } from "../supabase";
import type { Shop } from "../types";

/**
 * Salva il pacchetto "Invia diagnostica all'assistenza" e restituisce il codice ticket.
 * Il contenuto viene redatto anche qui: l'app non dovrebbe mandare dati personali, ma non ci si fida.
 */
export async function saveDiagnostics(
  shop: Shop,
  input: z.output<typeof DiagnosticsBody>,
  userId: string,
  actor: ActorFields,
) {
  const ctx = getContext() ?? {};
  const clean = redact(input);
  const size = JSON.stringify(clean).length;
  const { data, error } = await supabaseAdmin()
    .from("diagnostic_bundles")
    .insert({
      shop_id: shop.id,
      user_id: userId,
      request_id: ctx.request_id ?? null,
      platform: ctx.platform ?? null,
      app_version: ctx.app_version ?? null,
      size_bytes: size,
      device: clean.device,
      events: clean.events,
      note: clean.note ?? null,
    })
    .select("ticket_code")
    .single<{ ticket_code: string }>();
  if (error) throw error;
  log.event("diagnostics.received", {
    ...actor,
    shop_name: shop.name,
    ticket_code: data.ticket_code,
    size_bytes: size,
    events_count: input.events.length,
  });
  return { ticketCode: data.ticket_code };
}
