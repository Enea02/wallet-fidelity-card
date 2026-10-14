import { describe, expect, it } from "vitest";
import { createLogger, type LogContext, type LogLine } from ".";

function capture(opts: Parameters<typeof createLogger>[0] = {}) {
  const lines: LogLine[] = [];
  const texts: string[] = [];
  const log = createLogger({
    now: () => new Date("2026-11-03T09:32:14.512Z"),
    sink: (text, line) => {
      texts.push(text);
      lines.push(line);
    },
    ...opts,
  });
  return { log, lines, texts };
}

const reqEnd = {
  method: "POST",
  route: "/api/staff/stamp",
  status: 200,
  duration_ms: 182,
  error_code: null,
  error_message: null,
  support_code: "ERR-7K3QX",
} as const;

describe("logger", () => {
  it("scrive JSON con campi standard dal contesto, campi dell'evento e msg", () => {
    const ctx: LogContext = { request_id: "01JB7K3QX0ABCDEFGHJKMNPQRS", shop_id: "s1", platform: "ios" };
    const { log, texts } = capture({ getContext: () => ctx, base: { app: "web" } });
    log.event("http.request.end", reqEnd);
    const parsed = JSON.parse(texts[0] ?? "");
    expect(parsed).toMatchObject({
      ts: "2026-11-03T09:32:14.512Z",
      level: "info",
      event: "http.request.end",
      app: "web",
      request_id: ctx.request_id,
      shop_id: "s1",
      platform: "ios",
      status: 200,
      duration_ms: 182,
    });
    expect(parsed.msg).toBe("POST /api/staff/stamp completata con 200 in 182 ms.");
  });

  it("rispetta il livello minimo, anche quando dipende dal contesto", () => {
    let shop = "a";
    const { log, lines } = capture({
      getContext: () => ({ shop_id: shop }),
      minLevel: (ctx) => (ctx.shop_id === "b" ? "debug" : "info"),
    });
    const payload = { direction: "richiesta", method: "POST", route: "/x", size_bytes: 2, body: {} } as const;
    expect(log.event("http.request.payload", payload)).toBeNull();
    shop = "b";
    expect(log.event("http.request.payload", payload)).not.toBeNull();
    expect(lines).toHaveLength(1);
    expect(log.isEnabled("debug")).toBe(true);
  });

  it("il livello del catalogo si può alzare per la singola riga", () => {
    const { log, lines } = capture();
    log.event(
      "http.request.end",
      { ...reqEnd, status: 403, error_code: "E_FORBIDDEN_SHOP", error_message: "no" },
      {
        level: "warn",
      },
    );
    expect(lines[0]?.level).toBe("warn");
  });

  it("allega l'errore con stack e applica la redazione anche al msg", () => {
    const { log, lines, texts } = capture();
    // JWT finto costruito a runtime (nessuna stringa con forma di segreto nel repository)
    const part = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const jwt = [part({ alg: "HS256" }), part({ sub: "utente-finto" }), "firmafinta"].join(".");
    log.event(
      "wallet.google.patch.failed",
      {
        customer_ref: "B71D0E44",
        shop_name: "Salone Mario",
        stamps: 7,
        stamps_required: 10,
        rewards: 0,
        card_state: "ACTIVE",
        duration_ms: 120,
        attempt: 1,
        http_status: 401,
        error_code: "E_GOOGLE_AUTH",
        provider_response: `token ${jwt} rifiutato`,
        retry_in_min: 1,
      },
      { error: new Error(`boom ${jwt}`) },
    );
    expect(texts[0]).not.toContain(jwt);
    expect((lines[0]?.error as { stack: string }).stack).toContain("boom");
  });

  it("in formato leggibile mostra ora italiana, livello, msg, evento e codice assistenza", () => {
    const { log, texts } = capture({
      format: "pretty",
      getContext: () => ({ request_id: "01JB7K3QX0ABCDEFGHJKMNPQRS" }),
    });
    log.event("http.request.end", reqEnd);
    expect(texts[0]).toBe(
      "10:32:14 INFO  POST /api/staff/stamp completata con 200 in 182 ms.  [http.request.end · ERR-7K3QX]",
    );
  });
});
