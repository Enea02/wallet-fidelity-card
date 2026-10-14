import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { AppError } from "@loyalty/shared/errors";
import type { LogLine } from "@loyalty/shared/logger";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setActiveDiagnosticModes } from "./diagnostic-state";
import { fetchExternal } from "./fetch-external";
import { captureLogs } from "./test-utils";

vi.mock("./diagnostic", () => ({ refreshDiagnosticModes: () => Promise.resolve() }));

let server: Server;
let base = "";
beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url?.startsWith("/ok")) {
      res.writeHead(200, { "content-type": "application/json" }).end('{"id":"3388.cust-1"}');
    } else if (req.url?.startsWith("/401")) {
      res
        .writeHead(401)
        .end(`Request had invalid authentication credentials. Bearer ya29.segreto ${"x".repeat(10_000)}`);
    } else if (req.url?.startsWith("/lento")) {
      setTimeout(() => res.writeHead(200).end("tardi"), 500);
    }
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

let lines: LogLine[];
beforeEach(() => {
  lines = captureLogs();
  setActiveDiagnosticModes([]);
});

const call = { provider: "google", operation: "aggiornamento carta", objectId: "3388.cust-1" };

describe("fetchExternal", () => {
  it("chiamata riuscita: external.call.ok con endpoint senza query, status, durata e tentativo", async () => {
    const res = await fetchExternal({ ...call, url: `${base}/ok?key=segreta`, method: "PATCH", body: { a: 1 } });
    expect(res.status).toBe(200);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      event: "external.call.ok",
      provider: "google",
      method: "PATCH",
      endpoint: `${base}/ok`,
      http_status: 200,
      attempt: 1,
      object_id: "3388.cust-1",
    });
    expect(JSON.stringify(lines)).not.toContain("segreta");
  });

  it("errore HTTP: una riga external.call.failed con la risposta redatta e troncata a 4 KB, poi E_EXTERNAL_HTTP", async () => {
    const err = await fetchExternal({ ...call, url: `${base}/401`, attempt: 2 }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).code).toBe("E_EXTERNAL_HTTP");
    expect(lines).toHaveLength(1);
    const line = lines[0];
    expect(line).toMatchObject({ event: "external.call.failed", level: "error", http_status: 401, attempt: 2 });
    const response = line?.provider_response as string;
    expect(response).toContain("invalid authentication credentials");
    expect(response).not.toContain("ya29.segreto");
    expect(response.length).toBeLessThanOrEqual(4 * 1024 + 20);
    expect(line?.msg).toContain("status 401");
  });

  it("timeout: external.call.failed senza status e E_EXTERNAL_UNAVAILABLE", async () => {
    const err = await fetchExternal({ ...call, url: `${base}/lento`, timeoutMs: 50 }).catch((e: unknown) => e);
    expect((err as AppError).code).toBe("E_EXTERNAL_UNAVAILABLE");
    expect(lines[0]).toMatchObject({ event: "external.call.failed", http_status: null });
    expect(lines[0]?.msg).toContain("timeout dopo 50 ms");
  });
});
