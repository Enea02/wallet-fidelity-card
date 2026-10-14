import { api } from "../api";
import { deviceInfo } from "./device";
import { fitBundle } from "./bundle";
import { buffer, log } from "./logger";

/** "Invia diagnostica all'assistenza": buffer + dispositivo → codice ticket dal backend. */
export async function sendDiagnostics(shopId: string, note?: string): Promise<string> {
  const { body, size } = fitBundle(await deviceInfo(), buffer.snapshot(), note?.trim() || undefined);
  const { ticketCode } = await api.call("diagnostics", { shopId, body });
  log.event("app.diagnostics.sent", { ticket_code: ticketCode, events_count: body.events.length, size_bytes: size });
  return ticketCode;
}
