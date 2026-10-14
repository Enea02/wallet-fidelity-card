import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkOrigin, preflight, withCorsHeaders } from "./cors";

const req = (origin?: string) =>
  new Request("http://localhost/api/v1/merchant/me", origin ? { headers: { origin } } : {});

beforeEach(() => {
  process.env.MERCHANT_APP_ORIGINS = "https://app.esempio.it, http://localhost:8081";
});
afterEach(() => {
  delete process.env.MERCHANT_APP_ORIGINS;
});

describe("CORS dell'API esercente", () => {
  it("ammette le origini configurate e le richieste senza Origin (app native)", () => {
    expect(checkOrigin(req("https://app.esempio.it"))).toBe("https://app.esempio.it");
    expect(checkOrigin(req())).toBeNull();
  });

  it("rifiuta le altre origini con E_CORS_ORIGIN", () => {
    expect(() => checkOrigin(req("https://app.esempio.it.evil.com"))).toThrow(
      expect.objectContaining({ code: "E_CORS_ORIGIN" }),
    );
  });

  it("preflight: 204 con metodi e header per le origini ammesse, 403 per le altre", async () => {
    const ok = await preflight(req("http://localhost:8081"));
    expect(ok.status).toBe(204);
    expect(ok.headers.get("access-control-allow-headers")).toContain("x-shop-id");
    expect((await preflight(req("https://altro.it"))).status).toBe(403);
  });

  it("aggiunge gli header solo per le origini ammesse", () => {
    expect(
      withCorsHeaders(new Response("ok"), req("http://localhost:8081")).headers.get("access-control-allow-origin"),
    ).toBe("http://localhost:8081");
    expect(
      withCorsHeaders(new Response("ok"), req("https://altro.it")).headers.get("access-control-allow-origin"),
    ).toBeNull();
  });
});
