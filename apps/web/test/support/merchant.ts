/**
 * Supporto agli smoke test delle API esercente: chiama le route vere (stesso codice di
 * produzione, senza server HTTP) a partire dal registro dei contratti.
 */
import { createHmac, randomInt, randomUUID } from "node:crypto";
import { HEADERS, merchantApi, type MerchantEndpoint } from "@loyalty/shared/api";
import { createClient } from "@supabase/supabase-js";
import * as customer from "@/app/api/v1/merchant/customers/[id]/route";
import * as adjust from "@/app/api/v1/merchant/customers/[id]/adjust/route";
import * as marketing from "@/app/api/v1/merchant/customers/[id]/marketing/route";
import * as customers from "@/app/api/v1/merchant/customers/route";
import * as counterQr from "@/app/api/v1/merchant/counter-qr.pdf/route";
import * as diagnostics from "@/app/api/v1/merchant/diagnostics/route";
import * as me from "@/app/api/v1/merchant/me/route";
import * as promotions from "@/app/api/v1/merchant/promotions/route";
import * as redeem from "@/app/api/v1/merchant/redeem/route";
import * as lookup from "@/app/api/v1/merchant/scan/lookup/route";
import * as logoUpload from "@/app/api/v1/merchant/shop-settings/logo-upload-url/route";
import * as settings from "@/app/api/v1/merchant/shop-settings/route";
import * as shops from "@/app/api/v1/merchant/shops/route";
import * as staffMember from "@/app/api/v1/merchant/staff/[userId]/route";
import * as resendInvite from "@/app/api/v1/merchant/staff/[userId]/resend-invite/route";
import * as invite from "@/app/api/v1/merchant/staff/invite/route";
import * as staff from "@/app/api/v1/merchant/staff/route";
import * as stamp from "@/app/api/v1/merchant/stamp/route";
import * as stats from "@/app/api/v1/merchant/stats/route";
import * as undo from "@/app/api/v1/merchant/undo/route";
import * as prepaidActivate from "@/app/api/v1/merchant/prepaid/activate/route";
import * as prepaidConsume from "@/app/api/v1/merchant/prepaid/consume/route";
import * as prepaidRecharge from "@/app/api/v1/merchant/prepaid/recharge/route";
import * as prepaidUndo from "@/app/api/v1/merchant/prepaid/undo/route";
import * as prepaidAdjust from "@/app/api/v1/merchant/prepaid-cards/[id]/adjust/route";
import * as prepaidProduct from "@/app/api/v1/merchant/prepaid-products/[id]/route";
import * as prepaidProducts from "@/app/api/v1/merchant/prepaid-products/route";
import * as pointsAdd from "@/app/api/v1/merchant/points/add/route";
import * as pointsUndo from "@/app/api/v1/merchant/points/undo/route";
import * as pointsAdjust from "@/app/api/v1/merchant/customers/[id]/points/route";

type Handler = (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;

/** Handler di ogni endpoint del registro (il test di copertura verifica che non ne manchi nessuno). */
export const ROUTES: Record<MerchantEndpoint, Handler> = {
  me: me.GET,
  shops: shops.GET,
  lookup: lookup.POST,
  stamp: stamp.POST,
  undo: undo.POST,
  redeem: redeem.POST,
  stats: stats.GET,
  customers: customers.GET,
  customer: customer.GET,
  adjust: adjust.POST,
  deleteCustomer: customer.DELETE,
  marketing: marketing.POST,
  settings: settings.GET,
  updateSettings: settings.PUT,
  logoUploadUrl: logoUpload.POST,
  staff: staff.GET,
  invite: invite.POST,
  updateStaff: staffMember.PATCH,
  removeStaff: staffMember.DELETE,
  resendInvite: resendInvite.POST,
  promotions: promotions.GET,
  queuePromotion: promotions.POST,
  counterQr: counterQr.GET,
  diagnostics: diagnostics.POST,
  prepaidProducts: prepaidProducts.GET,
  createPrepaidProduct: prepaidProducts.POST,
  updatePrepaidProduct: prepaidProduct.PATCH,
  prepaidActivate: prepaidActivate.POST,
  prepaidConsume: prepaidConsume.POST,
  prepaidRecharge: prepaidRecharge.POST,
  prepaidUndo: prepaidUndo.POST,
  prepaidAdjust: prepaidAdjust.POST,
  pointsAdd: pointsAdd.POST,
  pointsUndo: pointsUndo.POST,
  pointsAdjust: pointsAdjust.POST,
};

export const SALONE = "11111111-1111-4111-8111-111111111111";
export const BARBIERE = "44444444-4444-4444-8444-444444444444";
export const GIULIA = "22222222-2222-4222-8222-222222222222"; // titolare di salone-demo
export const MARCO = "55555555-5555-4555-8555-555555555555"; // operatore di salone-demo e barbiere-demo

const env = (k: string) => process.env[k] ?? "";
export const admin = createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false },
});

const tokens = new Map<string, string>();
export async function tokenFor(email: string, password = "password-demo-locale"): Promise<string> {
  const cached = tokens.get(email);
  if (cached) return cached;
  const anon = createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("NEXT_PUBLIC_SUPABASE_ANON_KEY"), {
    auth: { persistSession: false },
  });
  const { data, error } = await anon.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`login di ${email} fallito: ${error.message}`);
  tokens.set(email, data.session.access_token);
  return data.session.access_token;
}

export const giulia = () => tokenFor("staff@salone-demo.test");
export const marco = () => tokenFor("operatore@salone-demo.test");

/** JWT scaduto firmato con il segreto del Supabase locale. */
export function expiredToken(): string {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const head = b64({ alg: "HS256", typ: "JWT" });
  const body = b64({ sub: GIULIA, aud: "authenticated", role: "authenticated", iat: now - 7200, exp: now - 3600 });
  const sig = createHmac("sha256", env("JWT_SECRET")).update(`${head}.${body}`).digest("base64url");
  return `${head}.${body}.${sig}`;
}

export interface CallOptions {
  token?: string | undefined;
  shopId?: string | undefined;
  body?: unknown;
  rawBody?: string;
  query?: Record<string, string>;
  params?: Record<string, string>;
  headers?: Record<string, string>;
}

export async function call(key: MerchantEndpoint, o: CallOptions = {}) {
  const def = merchantApi[key];
  const params = o.params ?? {};
  const path = def.path.replace(/\{(\w+)\}/g, (_, k: string) => encodeURIComponent(params[k] ?? ""));
  const url = new URL(`http://localhost:3000${path}`);
  for (const [k, v] of Object.entries(o.query ?? {})) url.searchParams.set(k, v);

  const headers: Record<string, string> = { ...o.headers };
  if (o.token) headers.authorization = `Bearer ${o.token}`;
  if (o.shopId) headers[HEADERS.shopId] = o.shopId;
  // azioni sul saldo: una chiave nuova per chiamata, come un tocco nell'app (i test la passano per i doppioni)
  if ("idempotent" in def && def.idempotent && !(HEADERS.idempotencyKey in headers)) {
    headers[HEADERS.idempotencyKey] = randomUUID();
  }
  const body =
    def.method === "GET" ? undefined : (o.rawBody ?? (o.body === undefined ? undefined : JSON.stringify(o.body)));
  if (body !== undefined) headers["content-type"] = "application/json";

  const res = await ROUTES[key](
    new Request(url, { method: def.method, headers, ...(body !== undefined && { body }) }),
    {
      params: Promise.resolve(params),
    },
  );
  const isJson = res.headers.get("content-type")?.includes("json") ?? false;
  const json = isJson ? ((await res.clone().json()) as Record<string, unknown>) : null;
  if (res.ok && json && def.response !== "pdf") def.response.parse(json); // contratto della risposta
  return { res, status: res.status, json, code: (json?.error as { code?: string } | undefined)?.code };
}

/** Nuovo cliente nel negozio, creato con la funzione di dominio (telefono univoco). */
let seq = 0;
// prefisso casuale per ogni file di test: i worker partono insieme, il timestamp non basta a separarli
const RUN = `3${randomInt(100_000, 999_999)}`;
export const testPhone = () => `+39${RUN}${String(seq++).padStart(3, "0")}`;
export const TEST_PHONE_PREFIX = `+39${RUN}`;

export async function newCustomer(shopId: string, opts: { name?: string; marketing?: boolean; phone?: string } = {}) {
  const { data, error } = await admin.rpc("enroll_customer", {
    p_shop_id: shopId,
    p_name: opts.name ?? "Cliente API",
    p_phone: opts.phone ?? testPhone(),
    p_consent_privacy: true,
    p_consent_marketing: opts.marketing ?? false,
    p_meta: { actor_type: "customer" },
  });
  if (error) throw new Error(error.message);
  const card = data as { customer_id: string; short_code: string; qr_token: string };
  return { id: card.customer_id, shortCode: card.short_code, qr: card.qr_token };
}

export const cleanupCustomers = () => admin.from("customers").delete().like("phone", `${TEST_PHONE_PREFIX}%`);
