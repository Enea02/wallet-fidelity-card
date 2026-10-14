/**
 * API Google Wallet simulata per gli smoke test: token OAuth, LoyaltyClass, LoyaltyObject e
 * addMessage, con lo stesso comportamento di Google sui casi che ci interessano (404 se manca,
 * 409 se esiste già) ed errori iniettabili (es. 401 su tutte le chiamate).
 */
import { generateKeyPairSync } from "node:crypto";
import { createServer, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

interface Failure {
  status: number;
  body: string;
  remaining: number;
  match: RegExp;
}

export interface GoogleMock {
  url: string;
  classes: Map<string, Record<string, unknown>>;
  objects: Map<string, Record<string, unknown>>;
  messages: Map<string, Map<string, Record<string, unknown>>>;
  calls: Array<{ method: string; path: string }>;
  /** Da ora le chiamate che corrispondono a `match` rispondono `status` (per `times` volte, default sempre). */
  fail(status: number, opts?: { times?: number; match?: RegExp; body?: string }): void;
  recover(): void;
  /** Variabili d'ambiente per usare questa API simulata. */
  env(): Record<string, string>;
  close(): Promise<void>;
}

export async function startGoogleMock(): Promise<GoogleMock> {
  const classes = new Map<string, Record<string, unknown>>();
  const objects = new Map<string, Record<string, unknown>>();
  const messages = new Map<string, Map<string, Record<string, unknown>>>();
  const calls: Array<{ method: string; path: string }> = [];
  let failure: Failure | null = null;

  const json = (res: ServerResponse, status: number, body: unknown) =>
    res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));
  const notFound = (res: ServerResponse, what: string) =>
    json(res, 404, { error: { code: 404, message: `${what} not found` } });

  const server: Server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c: Buffer) => (raw += c.toString()));
    req.on("end", () => {
      const path = (req.url ?? "").split("?")[0] ?? "";
      const method = req.method ?? "GET";
      if (path === "/token") return json(res, 200, { access_token: "token-di-prova", expires_in: 3600 });
      calls.push({ method, path });

      if (failure && failure.remaining > 0 && failure.match.test(`${method} ${path}`)) {
        failure.remaining -= 1;
        return res.writeHead(failure.status, { "content-type": "application/json" }).end(failure.body);
      }
      const body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};

      let m: RegExpMatchArray | null;
      if ((m = path.match(/^\/loyaltyClass\/([^/]+)$/)) && method === "PATCH") {
        if (!classes.has(m[1]!)) return notFound(res, "Class");
        classes.set(m[1]!, body);
        return json(res, 200, body);
      }
      if (path === "/loyaltyClass" && method === "POST") {
        if (classes.has(String(body.id))) return json(res, 409, { error: { code: 409, message: "exists" } });
        classes.set(String(body.id), body);
        return json(res, 200, body);
      }
      if ((m = path.match(/^\/loyaltyObject\/([^/]+)\/addMessage$/)) && method === "POST") {
        if (!objects.has(m[1]!)) return notFound(res, "Object");
        const msg = (body.message ?? {}) as Record<string, unknown>;
        const list = messages.get(m[1]!) ?? new Map<string, Record<string, unknown>>();
        if (list.has(String(msg.id))) return json(res, 409, { error: { code: 409, message: "duplicate message id" } });
        list.set(String(msg.id), msg);
        messages.set(m[1]!, list);
        return json(res, 200, { resource: objects.get(m[1]!) });
      }
      if ((m = path.match(/^\/loyaltyObject\/([^/]+)$/)) && method === "PATCH") {
        if (!objects.has(m[1]!)) return notFound(res, "Object");
        objects.set(m[1]!, body);
        return json(res, 200, body);
      }
      if (path === "/loyaltyObject" && method === "POST") {
        if (objects.has(String(body.id))) return json(res, 409, { error: { code: 409, message: "exists" } });
        if (!classes.has(String(body.classId))) return notFound(res, "Class");
        objects.set(String(body.id), body);
        return json(res, 200, body);
      }
      return notFound(res, "Route");
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const saKey = {
    type: "service_account",
    client_email: "wallet-test@progetto-di-prova.iam.gserviceaccount.com",
    private_key: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    token_uri: `${url}/token`,
  };

  return {
    url,
    classes,
    objects,
    messages,
    calls,
    fail(status, opts = {}) {
      failure = {
        status,
        body: opts.body ?? JSON.stringify({ error: { code: status, message: `errore simulato ${status}` } }),
        remaining: opts.times ?? Number.POSITIVE_INFINITY,
        match: opts.match ?? /./,
      };
    },
    recover() {
      failure = null;
    },
    env: () => ({
      GOOGLE_WALLET_ISSUER_ID: "3388000000099999999",
      GOOGLE_WALLET_SA_KEY_B64: Buffer.from(JSON.stringify(saKey)).toString("base64"),
      GOOGLE_WALLET_API_BASE: url,
      CARD_DEFAULT_LOGO_URL: "https://esempio.test/logo.png",
    }),
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}
