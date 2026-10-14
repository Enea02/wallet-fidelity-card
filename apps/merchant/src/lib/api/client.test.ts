import { describe, expect, it, vi } from "vitest";
import type { AppApiErrorFields } from "@loyalty/shared/logging/events";
import { isRequestId } from "@loyalty/shared/logging/request-id";
import { ApiError, createApiClient, type ApiDeps } from "./client";

const ME = {
  user: { id: "22222222-2222-4222-8222-222222222222", email: "staff@salone-demo.test" },
  memberships: [
    {
      shopId: "11111111-1111-4111-8111-111111111111",
      shopName: "Salone Demo",
      slug: "salone-demo",
      role: "owner",
      displayName: "Giulia",
    },
  ],
};
const SHOP = "11111111-1111-4111-8111-111111111111";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const apiError = (status: number, code: string, message: string, support_code = "ERR-ABCDE") =>
  json(status, { error: { code, message, support_code } });

function setup(responses: Array<Response | Error>, over: Partial<ApiDeps> = {}) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const logged: AppApiErrorFields[] = [];
  const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const next = responses.shift();
    if (!next) throw new Error("nessuna risposta preparata");
    if (next instanceof Error) throw next;
    return next;
  });
  const deps: ApiDeps = {
    baseUrl: "http://api.test",
    fetch: fetchMock as unknown as typeof fetch,
    platform: "ios",
    appVersion: "0.1.0",
    build: "7",
    getAccessToken: async () => "token-vecchio",
    refreshSession: vi.fn(async () => "token-nuovo"),
    onSessionExpired: vi.fn(),
    isOnline: () => true,
    logError: (f) => logged.push(f),
    ...over,
  };
  return { api: createApiClient(deps), calls, logged, deps };
}

const header = (init: RequestInit, name: string) => (init.headers as Record<string, string>)[name];

describe("client API esercente", () => {
  it("aggiunge token, request_id, piattaforma, versione e build; valida la risposta", async () => {
    const { api, calls } = setup([json(200, ME)]);
    const me = await api.call("me", {});
    expect(me.memberships[0]?.shopName).toBe("Salone Demo");
    const [c] = calls;
    expect(c?.url).toBe("http://api.test/api/v1/merchant/me");
    expect(header(c!.init, "authorization")).toBe("Bearer token-vecchio");
    expect(isRequestId(header(c!.init, "x-request-id") ?? "")).toBe(true);
    expect(header(c!.init, "x-platform")).toBe("ios");
    expect(header(c!.init, "x-app-version")).toBe("0.1.0");
    expect(header(c!.init, "x-app-build")).toBe("7");
  });

  it("manda X-Shop-Id e il body JSON alle API del negozio", async () => {
    const { api, calls } = setup([json(200, { ticketCode: "DIAG-7K3QXA2M" })]);
    const out = await api.call("diagnostics", { shopId: SHOP, body: { device: { os: "iOS" }, events: [] } });
    expect(out.ticketCode).toBe("DIAG-7K3QXA2M");
    expect(header(calls[0]!.init, "x-shop-id")).toBe(SHOP);
    expect(header(calls[0]!.init, "content-type")).toBe("application/json");
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({ device: { os: "iOS" }, events: [] });
  });

  it("sostituisce i parametri del percorso e la query", async () => {
    const id = "33333333-3333-4333-8333-333333333333";
    const { api, calls } = setup([apiError(404, "E_CARD_NOT_FOUND", "Carta non trovata.")]);
    await expect(api.call("customer", { shopId: SHOP, params: { id } })).rejects.toBeInstanceOf(ApiError);
    expect(calls[0]?.url).toBe(`http://api.test/api/v1/merchant/customers/${id}`);
  });

  it("errore del catalogo: messaggio e codice assistenza del server, riga app.api.error", async () => {
    const { api, logged } = setup([apiError(409, "E_STAMP_COOLDOWN", "Timbro già dato da poco.", "ERR-7K3QX")]);
    const err = await api
      .call("stamp", { shopId: SHOP, body: { customerId: "33333333-3333-4333-8333-333333333333" } })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    const e = err as ApiError;
    expect(e.code).toBe("E_STAMP_COOLDOWN");
    expect(e.userMessage).toBe("Timbro già dato da poco.");
    expect(e.supportCode).toBe("ERR-7K3QX");
    expect(e.status).toBe(409);
    expect(logged).toHaveLength(1);
    expect(logged[0]).toMatchObject({
      method: "POST",
      endpoint: "/api/v1/merchant/stamp",
      http_status: 409,
      error_code: "E_STAMP_COOLDOWN",
      support_code: "ERR-7K3QX",
      request_id: e.requestId,
    });
  });

  it("401: rinnova il token una volta e ripete la richiesta con lo stesso request_id", async () => {
    const { api, calls, deps } = setup([apiError(401, "E_AUTH_INVALID", "Sessione scaduta."), json(200, ME)]);
    await api.call("me", {});
    expect(deps.refreshSession).toHaveBeenCalledTimes(1);
    expect(calls).toHaveLength(2);
    expect(header(calls[1]!.init, "authorization")).toBe("Bearer token-nuovo");
    expect(header(calls[1]!.init, "x-request-id")).toBe(header(calls[0]!.init, "x-request-id"));
    expect(deps.onSessionExpired).not.toHaveBeenCalled();
  });

  it("401 e rinnovo fallito: E_SESSION_EXPIRED e uscita dalla sessione", async () => {
    const { api, calls, deps } = setup([apiError(401, "E_AUTH_INVALID", "Sessione scaduta.")], {
      refreshSession: vi.fn(async () => null),
    });
    const err = (await api.call("me", {}).catch((e: unknown) => e)) as ApiError;
    expect(err.code).toBe("E_SESSION_EXPIRED");
    expect(calls).toHaveLength(1);
    expect(deps.onSessionExpired).toHaveBeenCalledTimes(1);
  });

  it("401 anche dopo il rinnovo: esce dalla sessione senza riprovare all'infinito", async () => {
    const { api, calls, deps } = setup([
      apiError(401, "E_AUTH_INVALID", "Sessione scaduta."),
      apiError(401, "E_AUTH_INVALID", "Sessione scaduta."),
    ]);
    const err = (await api.call("me", {}).catch((e: unknown) => e)) as ApiError;
    expect(err.code).toBe("E_AUTH_INVALID");
    expect(calls).toHaveLength(2);
    expect(deps.onSessionExpired).toHaveBeenCalledTimes(1);
  });

  it("offline: E_OFFLINE senza chiamare il server", async () => {
    const { api, calls, logged } = setup([], { isOnline: () => false });
    const err = (await api.call("me", {}).catch((e: unknown) => e)) as ApiError;
    expect(err.code).toBe("E_OFFLINE");
    expect(err.userMessage).toMatch(/offline/);
    expect(err.supportCode).toMatch(/^ERR-[0-9A-Z]{5}$/);
    expect(calls).toHaveLength(0);
    expect(logged[0]?.http_status).toBeNull();
  });

  it("rete assente: E_NETWORK con codice assistenza calcolato dal request_id", async () => {
    const { api, logged } = setup([new TypeError("Network request failed")]);
    const err = (await api.call("me", {}).catch((e: unknown) => e)) as ApiError;
    expect(err.code).toBe("E_NETWORK");
    expect(err.supportCode).toBe(`ERR-${err.requestId.slice(4, 9)}`);
    expect(logged[0]).toMatchObject({ error_code: "E_NETWORK", http_status: null });
  });

  it("risposta che non rispetta il contratto: E_BAD_RESPONSE", async () => {
    const { api } = setup([json(200, { user: { id: "non-uuid" } })]);
    const err = (await api.call("me", {}).catch((e: unknown) => e)) as ApiError;
    expect(err.code).toBe("E_BAD_RESPONSE");
  });

  it("errore senza corpo del catalogo (es. pagina di un proxy): E_BAD_RESPONSE con lo status", async () => {
    const { api } = setup([new Response("<html>Bad gateway</html>", { status: 502 })]);
    const err = (await api.call("me", {}).catch((e: unknown) => e)) as ApiError;
    expect(err.code).toBe("E_BAD_RESPONSE");
    expect(err.status).toBe(502);
  });

  it("ogni chiamata ha un request_id diverso", async () => {
    const { api, calls } = setup([json(200, ME), json(200, ME)]);
    await api.call("me", {});
    await api.call("me", {});
    expect(header(calls[0]!.init, "x-request-id")).not.toBe(header(calls[1]!.init, "x-request-id"));
  });
});
