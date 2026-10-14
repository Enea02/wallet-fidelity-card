/**
 * Servizi esterni del web pubblico simulati per i test: Cloudflare Turnstile (token "ok" valido)
 * e Twilio Verify (invio e controllo del codice, con errori iniettabili).
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

export interface PublicMocks {
  turnstileUrl: string;
  twilioBase: string;
  /** SMS "inviati" a Twilio: numero → codice. */
  sms: Map<string, string>;
  twilioFailNext(status: number, body?: string): void;
  close(): Promise<void>;
}

export async function startPublicMocks(): Promise<PublicMocks> {
  const sms = new Map<string, string>();
  let fail: { status: number; body: string } | null = null;

  const server: Server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c: Buffer) => (raw += c.toString()));
    req.on("end", () => {
      const form = new URLSearchParams(raw);
      const json = (status: number, body: unknown) =>
        res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));

      if (req.url === "/turnstile") {
        const ok = form.get("response") === "ok" && Boolean(form.get("secret"));
        return json(200, ok ? { success: true } : { success: false, "error-codes": ["invalid-input-response"] });
      }
      if (fail) {
        const f = fail;
        fail = null;
        return res.writeHead(f.status, { "content-type": "application/json" }).end(f.body);
      }
      if (req.url?.endsWith("/Verifications")) {
        sms.set(form.get("To") ?? "", "654321");
        return json(201, { sid: "VE123", status: "pending", channel: form.get("Channel") });
      }
      if (req.url?.endsWith("/VerificationCheck")) {
        const to = form.get("To") ?? "";
        if (!sms.has(to)) return json(404, { code: 20404, message: "The requested resource was not found" });
        const approved = sms.get(to) === form.get("Code");
        if (approved) sms.delete(to);
        return json(200, { status: approved ? "approved" : "pending", valid: approved });
      }
      return json(404, {});
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    turnstileUrl: `${base}/turnstile`,
    twilioBase: base,
    sms,
    twilioFailNext(status, body = JSON.stringify({ code: 20003, message: "Authenticate" })) {
      fail = { status, body };
    },
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}
