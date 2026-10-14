import { AppError } from "@loyalty/shared/errors";
import { describe, expect, it } from "vitest";
import { classifyGoogleError } from "./client";

const http = (status: number, operation = "aggiornamento carta") =>
  new AppError("E_EXTERNAL_HTTP", `google ha risposto ${status} (${operation})`, {
    http_status: status,
    provider_response: `risposta ${status}`,
    duration_ms: 120,
  });

describe("errori di Google → catalogo", () => {
  it.each([
    [401, "E_GOOGLE_AUTH"],
    [403, "E_GOOGLE_AUTH"],
    [404, "E_GOOGLE_NOT_FOUND"],
    [429, "E_GOOGLE_QUOTA"],
    [400, "E_GOOGLE_INVALID_PAYLOAD"],
    [500, "E_GOOGLE_UNAVAILABLE"],
    [503, "E_GOOGLE_UNAVAILABLE"],
  ])("status %i → %s", (status, code) => {
    expect(classifyGoogleError(http(status))).toEqual({
      code,
      httpStatus: status,
      providerResponse: `risposta ${status}`,
      durationMs: 120,
    });
  });

  it("token OAuth rifiutato (es. 400 invalid_grant) = credenziali", () => {
    expect(classifyGoogleError(http(400, "token OAuth")).code).toBe("E_GOOGLE_AUTH");
  });

  it("timeout o rete: Google non risponde", () => {
    const e = new AppError("E_EXTERNAL_UNAVAILABLE", "google non raggiungibile", {
      provider_response: "timeout dopo 10000 ms",
    });
    expect(classifyGoogleError(e)).toMatchObject({ code: "E_GOOGLE_UNAVAILABLE", httpStatus: null });
  });

  it("un errore che non viene da una chiamata esterna non viene mascherato", () => {
    expect(() => classifyGoogleError(new TypeError("bug"))).toThrow(TypeError);
  });
});
