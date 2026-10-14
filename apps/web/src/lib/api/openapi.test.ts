import { merchantApi } from "@loyalty/shared/api";
import { describe, expect, it } from "vitest";
import { buildOpenApi } from "./openapi";

describe("documento OpenAPI", () => {
  const doc = buildOpenApi() as { openapi: string; paths: Record<string, Record<string, { operationId: string }>> };

  it("contiene ogni endpoint del registro, con il suo metodo", () => {
    for (const [key, def] of Object.entries(merchantApi)) {
      expect(doc.paths[def.path]?.[def.method.toLowerCase()]?.operationId, key).toBe(key);
    }
  });

  it("è OpenAPI 3.1 serializzabile", () => {
    expect(doc.openapi).toBe("3.1.0");
    expect(() => JSON.stringify(doc)).not.toThrow();
  });
});
