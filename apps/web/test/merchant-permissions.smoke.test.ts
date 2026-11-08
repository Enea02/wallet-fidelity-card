/**
 * Matrice dei permessi delle API esercente, generata dal registro dei contratti:
 * per OGNI endpoint, token assente/malformato/scaduto, utente di un altro negozio,
 * operatore e titolare, sia con il token Bearer (app native) sia con il cookie della sessione
 * web (login unico, web app su /app). I casi "ammessi" usano dati vuoti o id inesistenti:
 * verificano solo di superare autenticazione e permessi, senza effetti collaterali.
 */
import { merchantApi, type EndpointDef, type MerchantEndpoint } from "@loyalty/shared/api";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  BARBIERE,
  SALONE,
  SITE_ORIGIN,
  ROUTES,
  call,
  cleanupCustomers,
  cookieFor,
  expiredToken,
  giulia,
  marco,
} from "./support/merchant";

const endpoints = Object.entries(merchantApi) as Array<[MerchantEndpoint, EndpointDef]>;
const RANDOM_ID = "00000000-0000-4000-8000-000000000000";
const params = (def: EndpointDef) =>
  def.path.includes("{id}") ? { id: RANDOM_ID } : def.path.includes("{userId}") ? { userId: RANDOM_ID } : {};

let G = "";
let M = "";
let GC = "";
let MC = "";
beforeAll(async () => {
  [G, M, GC, MC] = await Promise.all([
    giulia(),
    marco(),
    cookieFor("staff@salone-demo.test"),
    cookieFor("operatore@salone-demo.test"),
  ]);
});

/** Cookie della sessione web per il caso "ammesso": nuovo per logout, che la chiude. */
const cookieOf = async (key: MerchantEndpoint, who: "G" | "M") =>
  key === "logout"
    ? cookieFor(who === "G" ? "staff@salone-demo.test" : "operatore@salone-demo.test", true)
    : who === "G"
      ? GC
      : MC;

const expectAdmitted = (r: { status: number; code?: string | undefined }) => {
  expect(NOT_AUTH_ERRORS).not.toContain(r.code);
  expect([401, 403]).not.toContain(r.status);
};
afterAll(cleanupCustomers);

const NOT_AUTH_ERRORS = ["E_AUTH_REQUIRED", "E_AUTH_INVALID", "E_FORBIDDEN_SHOP", "E_FORBIDDEN_ROLE"];

describe("ogni endpoint del registro ha la sua route", () => {
  it("nessun endpoint senza handler", () => {
    expect(Object.keys(ROUTES).sort()).toEqual(Object.keys(merchantApi).sort());
  });
});

describe.each(endpoints)("%s", (key, def) => {
  const p = params(def);

  it("senza token: 401 E_AUTH_REQUIRED", async () => {
    const r = await call(key, { shopId: SALONE, params: p, body: {} });
    expect([r.status, r.code]).toEqual([401, "E_AUTH_REQUIRED"]);
  });

  it("token malformato: 401 E_AUTH_INVALID", async () => {
    const r = await call(key, { token: "non-un-token", shopId: SALONE, params: p, body: {} });
    expect([r.status, r.code]).toEqual([401, "E_AUTH_INVALID"]);
  });

  it("token scaduto: 401 E_AUTH_INVALID", async () => {
    const r = await call(key, { token: expiredToken(), shopId: SALONE, params: p, body: {} });
    expect([r.status, r.code]).toEqual([401, "E_AUTH_INVALID"]);
  });

  it("sessione web con un cookie non valido: 401 E_AUTH_INVALID", async () => {
    const r = await call(key, {
      cookie: "sb-127-auth-token=base64-bm9uLXVuYS1zZXNzaW9uZQ",
      origin: SITE_ORIGIN,
      shopId: SALONE,
      params: p,
      body: {},
    });
    expect([r.status, r.code]).toEqual([401, "E_AUTH_INVALID"]);
  });

  if (def.method !== "GET") {
    it("sessione web senza Origin (richiesta non fatta da una nostra pagina): 403 E_CORS_ORIGIN", async () => {
      const r = await call(key, { cookie: GC, shopId: SALONE, params: p, body: {} });
      expect([r.status, r.code]).toEqual([403, "E_CORS_ORIGIN"]);
    });
  }

  if (def.auth === "user") {
    it("qualsiasi utente autenticato: ammesso", async () => {
      const r = await call(key, { token: M });
      if (def.body) expectAdmitted(r);
      else expect(r.status).toBe(200);
    });
    it("qualsiasi utente con la sessione web: ammesso", async () => {
      const r = await call(key, { cookie: await cookieOf(key, "M"), origin: SITE_ORIGIN, body: {} });
      expectAdmitted(r);
    });
    return;
  }

  it("sessione web di un altro negozio: 403 E_FORBIDDEN_SHOP", async () => {
    const r = await call(key, { cookie: GC, origin: SITE_ORIGIN, shopId: BARBIERE, params: p, body: {} });
    expect([r.status, r.code]).toEqual([403, "E_FORBIDDEN_SHOP"]);
  });

  if (def.auth === "owner") {
    it("operatore con la sessione web: 403 E_FORBIDDEN_ROLE", async () => {
      const r = await call(key, { cookie: MC, origin: SITE_ORIGIN, shopId: SALONE, params: p, body: {} });
      expect([r.status, r.code]).toEqual([403, "E_FORBIDDEN_ROLE"]);
    });
  }

  it("titolare con la sessione web: ammesso", async () => {
    const r = await call(key, { cookie: GC, origin: SITE_ORIGIN, shopId: SALONE, params: p, body: {} });
    expectAdmitted(r);
  });

  it("utente di un altro negozio: 403 E_FORBIDDEN_SHOP", async () => {
    // Giulia è solo nel salone: sul barbiere non ha accesso
    const r = await call(key, { token: G, shopId: BARBIERE, params: p, body: {} });
    expect([r.status, r.code]).toEqual([403, "E_FORBIDDEN_SHOP"]);
  });

  it("negozio non indicato: 400 E_VALIDATION", async () => {
    const r = await call(key, { token: G, params: p, body: {} });
    expect([r.status, r.code]).toEqual([400, "E_VALIDATION"]);
  });

  if (def.auth === "owner") {
    it("operatore: 403 E_FORBIDDEN_ROLE", async () => {
      const r = await call(key, { token: M, shopId: SALONE, params: p, body: {} });
      expect([r.status, r.code]).toEqual([403, "E_FORBIDDEN_ROLE"]);
    });
  } else {
    it("operatore: ammesso", async () => {
      const r = await call(key, { token: M, shopId: SALONE, params: p, body: {} });
      expect(NOT_AUTH_ERRORS).not.toContain(r.code);
      expect([401, 403]).not.toContain(r.status);
    });
  }

  it("titolare: ammesso", async () => {
    const r = await call(key, { token: G, shopId: SALONE, params: p, body: {} });
    expect(NOT_AUTH_ERRORS).not.toContain(r.code);
    expect([401, 403]).not.toContain(r.status);
  });
});
