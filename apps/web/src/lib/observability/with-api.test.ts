import { AppError } from "@loyalty/shared/errors";
import type { LogLine } from "@loyalty/shared/logger";
import { isRequestId, newRequestId, supportCodeFromRequestId } from "@loyalty/shared/logging/request-id";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { setContext } from "./context";
import { setActiveDiagnosticModes, type DiagnosticMode } from "./diagnostic-state";
import { captureLogs } from "./test-utils";
import { parseJsonBody } from "./validation";
import { withApi } from "./with-api";

// niente database nei test unitari: le modalità attive si impostano a mano
vi.mock("./diagnostic", () => ({ refreshDiagnosticModes: () => Promise.resolve() }));

let lines: LogLine[];
beforeEach(() => {
  lines = captureLogs();
  setActiveDiagnosticModes([]);
});

const req = (body?: unknown, headers: Record<string, string> = {}) =>
  new Request("http://localhost/api/prova", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body ?? {}),
  });

const errorLines = () => lines.filter((l) => l.level === "error");

describe("withApi", () => {
  it("richiesta riuscita: request_id nuovo in risposta, righe di inizio e fine con lo stesso request_id", async () => {
    const res = await withApi(async () => Response.json({ ok: true }))(req());
    const rid = res.headers.get("x-request-id") ?? "";
    expect(res.status).toBe(200);
    expect(isRequestId(rid)).toBe(true);
    expect(lines.map((l) => l.event)).toEqual(["http.request.start", "http.request.end"]);
    expect(lines.every((l) => l.request_id === rid)).toBe(true);
    expect(lines[1]).toMatchObject({ level: "info", status: 200, route: "/api/prova", method: "POST" });
    expect(typeof lines[1]?.duration_ms).toBe("number");
  });

  it("riusa X-Request-Id se è un ULID valido, altrimenti lo sostituisce", async () => {
    const mine = newRequestId();
    const ok = await withApi(async () => new Response("ok"))(req({}, { "x-request-id": mine }));
    expect(ok.headers.get("x-request-id")).toBe(mine);

    const bad = await withApi(async () => new Response("ok"))(req({}, { "x-request-id": "'; drop table--" }));
    expect(bad.headers.get("x-request-id")).not.toBe("'; drop table--");
    expect(isRequestId(bad.headers.get("x-request-id") ?? "")).toBe(true);
  });

  it("riporta piattaforma e versione dell'app inviate dal client", async () => {
    await withApi(async () => new Response("ok"))(req({}, { "x-platform": "ios", "x-app-version": "1.4.0" }));
    expect(lines[0]).toMatchObject({ platform: "ios", app_version: "1.4.0" });
    expect(lines[0]?.msg).toBe("Richiesta POST /api/prova ricevuta da ios (app 1.4.0).");
  });

  it("errore del catalogo: risposta standard e una sola riga warn, nessuna riga error", async () => {
    const res = await withApi(async () => {
      setContext({ user_id: "u1", shop_id: "s9" });
      throw new AppError("E_FORBIDDEN_SHOP", "l'utente u1 non è abilitato sul negozio s9");
    })(req());
    const rid = res.headers.get("x-request-id") ?? "";
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: {
        code: "E_FORBIDDEN_SHOP",
        message: "Il tuo utente non è abilitato su questo negozio.",
        support_code: supportCodeFromRequestId(rid),
      },
    });
    expect(errorLines()).toHaveLength(0);
    const end = lines.find((l) => l.event === "http.request.end");
    expect(end).toMatchObject({
      level: "warn",
      status: 403,
      error_code: "E_FORBIDDEN_SHOP",
      shop_id: "s9",
      user_id: "u1",
    });
  });

  it("errore già registrato da un evento di dominio: la riga di fine è a livello info, nessun warn", async () => {
    await withApi(async () => {
      throw Object.assign(new AppError("E_STAMP_COOLDOWN", "ultimo timbro 8 minuti fa"), { logged: true });
    })(req());
    const end = lines.find((l) => l.event === "http.request.end");
    expect(end).toMatchObject({ level: "info", status: 409, error_code: "E_STAMP_COOLDOWN" });
    expect(lines.filter((l) => l.level === "warn" || l.level === "error")).toHaveLength(0);
  });

  it("errore non gestito: UNA sola riga error con stack, request_id e support_code, e un 500 standard", async () => {
    const res = await withApi(async () => {
      throw new TypeError("Cannot read properties of undefined (reading 'stamps')");
    })(req());
    const rid = res.headers.get("x-request-id") ?? "";
    const body = (await res.json()) as { error: { code: string; message: string; support_code: string } };
    expect(res.status).toBe(500);
    expect(body.error.code).toBe("E_INTERNAL");
    expect(body.error.support_code).toBe(supportCodeFromRequestId(rid));
    expect(body.error.message).not.toContain("stamps"); // niente dettagli interni al client

    expect(errorLines()).toHaveLength(1);
    const failed = errorLines()[0];
    expect(failed).toMatchObject({
      event: "http.request.failed",
      request_id: rid,
      support_code: supportCodeFromRequestId(rid),
      error_code: "E_INTERNAL",
      status: 500,
    });
    expect((failed?.error as { stack: string }).stack).toContain("TypeError");
    expect(lines.filter((l) => l.event === "http.request.end")).toHaveLength(0);
  });

  it("errore del database (supabase-js): E_DB con il dettaglio nel log", async () => {
    const res = await withApi(async () => {
      throw { message: 'relation "customers" does not exist', code: "42P01", details: null, hint: null };
    })(req());
    expect(res.status).toBe(500);
    expect(errorLines()[0]).toMatchObject({ error_code: "E_DB" });
    expect(errorLines()[0]?.msg).toContain('relation "customers" does not exist');
  });

  it("validazione: JSON malformato e campo errato diventano E_VALIDATION con il campo", async () => {
    const schema = z.object({ shopId: z.uuid() });
    const handler = withApi(async (r: Request) => Response.json(await parseJsonBody(r, schema)));

    const notJson = await handler(req("{non json"));
    expect(notJson.status).toBe(400);
    expect(((await notJson.json()) as { error: { code: string } }).error.code).toBe("E_VALIDATION");

    const badField = await handler(req({ shopId: "abc" }));
    expect(badField.status).toBe(400);
    const end = lines.filter((l) => l.event === "http.request.end").at(-1);
    expect(end?.error_message).toContain("shopId");
  });

  it("modalità diagnostica: payload redatti solo per il negozio indicato", async () => {
    const mode: DiagnosticMode = {
      id: "d1",
      scope_type: "shop",
      scope_id: "shop-diag",
      scope_label: "salone-demo",
      level: "debug",
      reason: "prova",
      enabled_by: "test",
      enabled_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 3600_000).toISOString(),
    };
    setActiveDiagnosticModes([mode]);
    const qr = "0123456789abcdef".repeat(2);
    const body = { qrToken: qr, phone: "+39 333 1234567" };
    const handlerFor = (shop: string) =>
      withApi(async (r: Request) => {
        setContext({ shop_id: shop });
        await r.json();
        return Response.json({ ok: true });
      });

    await handlerFor("altro-negozio")(req(body));
    expect(lines.some((l) => l.event === "http.request.payload")).toBe(false);

    await handlerFor("shop-diag")(req(body));
    const payloads = lines.filter((l) => l.event === "http.request.payload");
    expect(payloads.map((l) => l.direction)).toEqual(["richiesta", "risposta"]);
    const text = JSON.stringify(payloads);
    expect(text).not.toContain(qr);
    expect(text).not.toContain("1234567");
  });
});
