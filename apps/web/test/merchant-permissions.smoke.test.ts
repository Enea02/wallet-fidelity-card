/**
 * Matrice dei permessi delle API esercente, generata dal registro dei contratti:
 * per OGNI endpoint, token assente/malformato/scaduto, utente di un altro negozio,
 * operatore e titolare. I casi "ammessi" usano dati vuoti o id inesistenti:
 * verificano solo di superare autenticazione e permessi, senza effetti collaterali.
 */
import { merchantApi, type EndpointDef, type MerchantEndpoint } from "@loyalty/shared/api";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BARBIERE, SALONE, ROUTES, call, cleanupCustomers, expiredToken, giulia, marco } from "./support/merchant";

const endpoints = Object.entries(merchantApi) as Array<[MerchantEndpoint, EndpointDef]>;
const RANDOM_ID = "00000000-0000-4000-8000-000000000000";
const params = (def: EndpointDef) =>
  def.path.includes("{id}") ? { id: RANDOM_ID } : def.path.includes("{userId}") ? { userId: RANDOM_ID } : {};

let G = "";
let M = "";
beforeAll(async () => {
  [G, M] = await Promise.all([giulia(), marco()]);
});
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

  if (def.auth === "user") {
    it("qualsiasi utente autenticato: ammesso", async () => {
      const r = await call(key, { token: M });
      expect(r.status).toBe(200);
    });
    return;
  }

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
