import { HEADERS, merchantApi, type EndpointDef, type MerchantEndpoint } from "@loyalty/shared/api";
import { AppError } from "@loyalty/shared/errors";
import type { ActorFields } from "@loyalty/shared/logging/events";
import type { z } from "zod";
import { authenticateUser, loadMembership, type AuthUser, type Membership } from "../auth";
import { getShopById } from "../loyalty";
import { getContext, setContext } from "../observability/context";
import { log } from "../observability/logger";
import { withApi } from "../observability/with-api";
import type { Shop } from "../types";
import { checkOrigin, preflight, withCorsHeaders } from "./cors";
import { enforceRateLimit } from "./rate-limit";

export { preflight };

type Def<K extends MerchantEndpoint> = (typeof merchantApi)[K];
type Parsed<S> = S extends z.ZodType ? z.output<S> : undefined;
type Output<D> = D extends { response: infer R } ? (R extends z.ZodType ? z.input<R> : Response) : never;

export interface MerchantContext<K extends MerchantEndpoint> {
  req: Request;
  user: AuthUser;
  /** Per le API di un negozio: chi agisce e dove. */
  staff: Def<K>["auth"] extends "user" ? null : Membership;
  shop: Def<K>["auth"] extends "user" ? null : Shop;
  /** "Giulia (operatore, iOS 1.4.0)" per gli eventi di log. */
  actor: ActorFields;
  params: Parsed<Def<K> extends { params: infer P } ? P : undefined>;
  query: Parsed<Def<K> extends { query: infer Q } ? Q : undefined>;
  body: Parsed<Def<K> extends { body: infer B } ? B : undefined>;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULT_MAX_BODY = 64 * 1024;

function validationError(where: string, err: z.ZodError): AppError {
  const fields = err.issues.map((i) => ({ field: [where, ...i.path].join("."), problem: i.message }));
  const first = fields[0];
  return new AppError(
    "E_VALIDATION",
    `dati non validi, ${fields.map((f) => `campo ${f.field}: ${f.problem}`).join("; ")}`,
    { fields: fields.map((f) => f.field) },
    { userMessage: first ? `Dati non validi: ${first.problem}` : "Dati non validi." },
  );
}

function parseWith(schema: z.ZodType | undefined, value: unknown, where: string): unknown {
  if (!schema) return undefined;
  const r = schema.safeParse(value);
  if (!r.success) throw validationError(where, r.error);
  return r.data;
}

async function readBody(req: Request, def: EndpointDef): Promise<unknown> {
  if (!def.body) return undefined;
  const max = def.maxBodyBytes ?? DEFAULT_MAX_BODY;
  const declared = Number(req.headers.get("content-length"));
  const text = Number.isFinite(declared) && declared > max ? null : await req.text();
  if (text === null || text.length > max) {
    throw new AppError(
      "E_PAYLOAD_TOO_LARGE",
      `body di ${text?.length ?? declared} byte, massimo ${max} per ${def.path}`,
    );
  }
  if (text.trim() === "") return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new AppError(
      "E_VALIDATION",
      "il body della richiesta non è JSON valido",
      {},
      { userMessage: "Richiesta non valida." },
    );
  }
}

function actorFor(staff: Membership | null): ActorFields {
  const ctx = getContext() ?? {};
  return {
    actor_name: staff?.displayName ?? "utente",
    actor_role: staff?.role ?? "operator",
    platform: ctx.platform ?? "sconosciuta",
    app_version: ctx.app_version ?? "n/d",
  };
}

/** Negozio indicato da X-Shop-Id e appartenenza dell'utente (con il ruolo richiesto). */
async function resolveShop(req: Request, user: AuthUser, def: EndpointDef): Promise<{ staff: Membership; shop: Shop }> {
  const shopId = req.headers.get(HEADERS.shopId)?.trim() ?? "";
  if (!UUID_RE.test(shopId)) {
    throw new AppError(
      "E_VALIDATION",
      `header ${HEADERS.shopId} assente o non valido`,
      { fields: [HEADERS.shopId] },
      {
        userMessage: "Negozio non indicato: seleziona un negozio e riprova.",
      },
    );
  }
  setContext({ shop_id: shopId });

  const staff = await loadMembership(user.id, shopId);
  if (!staff) {
    log.event("auth.forbidden.shop", { route: def.path, user_id: user.id, shop_id: shopId });
    const err = new AppError("E_FORBIDDEN_SHOP", `l'utente ${user.id} non è abilitato sul negozio ${shopId}`, {
      user_id: user.id,
      shop_id: shopId,
    });
    err.logged = true;
    throw err;
  }
  setContext({ role: staff.role });
  const shop = await getShopById(shopId);

  if (def.auth === "owner" && staff.role !== "owner") {
    log.event("auth.forbidden.role", {
      ...actorFor(staff),
      route: def.path,
      shop_name: shop.name,
      required_role: "owner",
    });
    const err = new AppError("E_FORBIDDEN_ROLE", `${def.path} è riservata al titolare, l'utente è operatore`);
    err.logged = true;
    throw err;
  }
  return { staff, shop };
}

/**
 * Route dell'app esercente definita dal registro dei contratti (packages/shared/api/registry.ts):
 * request_id e log (withApi), CORS, rate limit per IP e per utente, autenticazione,
 * negozio e ruolo, validazione di params, query e body; in sviluppo e test anche della risposta.
 */
export function merchantRoute<K extends MerchantEndpoint>(
  key: K,
  handler: (ctx: MerchantContext<K>) => Promise<Output<Def<K>>>,
) {
  const def: EndpointDef = merchantApi[key];

  const run = withApi(async (req: Request, next?: { params?: Promise<Record<string, string>> }) => {
    checkOrigin(req);
    const ipHash = getContext()?.ip_hash ?? "sconosciuto";
    await enforceRateLimit("IP", ipHash, def.path);
    const user = await authenticateUser(req, def.path);
    await enforceRateLimit("utente", user.id, def.path);

    const { staff, shop } = def.auth === "user" ? { staff: null, shop: null } : await resolveShop(req, user, def);

    const params = parseWith(def.params, (await next?.params) ?? {}, "params");
    const query = parseWith(def.query, Object.fromEntries(new URL(req.url).searchParams), "query");
    const body = parseWith(def.body, await readBody(req, def), "body");

    const out = await handler({
      req,
      user,
      staff,
      shop,
      actor: actorFor(staff),
      params,
      query,
      body,
    } as MerchantContext<K>);
    if (out instanceof Response) return out;
    if (def.response !== "pdf" && process.env.NODE_ENV !== "production") {
      // il contratto vale anche per noi: in sviluppo e nei test una risposta fuori contratto è un bug
      const check = def.response.safeParse(out);
      if (!check.success) throw new Error(`risposta di ${def.path} fuori contratto: ${check.error.message}`);
    }
    return Response.json(out);
  });

  return async (req: Request, next?: { params?: Promise<Record<string, string>> }) =>
    withCorsHeaders(await run(req, next), req);
}
