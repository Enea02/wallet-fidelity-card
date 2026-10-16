import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { expect, type Page } from "@playwright/test";

export const API = "http://localhost:3110";
export const PASSWORD = "password-demo-locale";
export const OWNER = "staff@salone-demo.test";
export const OPERATOR = "operatore@salone-demo.test";
export const SALONE = "11111111-1111-4111-8111-111111111111";
export const BARBIERE = "44444444-4444-4444-8444-444444444444";
/** Cliente del seed (salone-demo) con QR fisso: è anche nel video finto della fotocamera. */
export const DEMO_QR = "0123456789abcdef0123456789abcdef";

const status = JSON.parse(
  execFileSync("supabase", ["status", "-o", "json"], { stdio: ["ignore", "pipe", "ignore"] }).toString(),
) as Record<string, string>;
export const SUPABASE_URL = status.API_URL ?? "";
const ANON = status.ANON_KEY ?? "";
const SERVICE = status.SERVICE_ROLE_KEY ?? "";
const MAILPIT = (status.MAILPIT_URL ?? status.INBUCKET_URL ?? "http://127.0.0.1:54324").replace(/\/$/, "");

export async function login(page: Page, email: string, password = PASSWORD) {
  await page.goto("/");
  await page.getByTestId("campo-email").fill(email);
  await page.getByTestId("campo-password").fill(password);
  await page.getByTestId("pulsante-accedi").click();
}

/** Righe JSON del log del backend (e2e-logs/server.log). */
export function serverLog(): Array<Record<string, unknown>> {
  return readFileSync("e2e-logs/server.log", "utf8")
    .split("\n")
    .filter((l) => l.startsWith("{"))
    .map((l) => JSON.parse(l) as Record<string, unknown>);
}

export async function expectLogLine(match: (l: Record<string, unknown>) => boolean) {
  await expect.poll(() => serverLog().some(match), { timeout: 10_000 }).toBe(true);
  return serverLog().find(match)!;
}

/** Token di uno staff (login con password, come l'app). */
export async function accessToken(email: string, password = PASSWORD): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = (await res.json()) as { access_token?: string };
  if (!body.access_token) throw new Error(`login di ${email} non riuscito: ${res.status}`);
  return body.access_token;
}

/** Link dell'ultima email arrivata a `to` in Mailpit (invito o recupero password). */
export async function emailLink(to: string, subject: RegExp): Promise<string> {
  let link = "";
  await expect
    .poll(
      async () => {
        const list = (await (
          await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`)
        ).json()) as {
          messages: Array<{ ID: string; Subject: string }>;
        };
        const msg = list.messages.find((m) => subject.test(m.Subject));
        if (!msg) return "";
        const full = (await (await fetch(`${MAILPIT}/api/v1/message/${msg.ID}`)).json()) as { HTML: string };
        link = /href="([^"]*\/auth\/v1\/verify[^"]*)"/.exec(full.HTML)?.[1]?.replace(/&amp;/g, "&") ?? "";
        return link;
      },
      { timeout: 15_000 },
    )
    .not.toBe("");
  return link;
}

/** Modifica la sessione salvata da supabase-js nel browser (per simulare token scaduti). */
export async function tamperSession(page: Page, change: { access_token?: string; refresh_token?: string }) {
  await page.evaluate((c) => {
    const key = Object.keys(localStorage).find((k) => k.startsWith("sb-") && k.endsWith("-auth-token"));
    if (!key) throw new Error("sessione non trovata nel localStorage");
    const s = JSON.parse(localStorage.getItem(key) ?? "{}") as Record<string, unknown>;
    localStorage.setItem(key, JSON.stringify({ ...s, ...c }));
  }, change);
}

/* ---------- dati dei test dello scanner (service role: solo nei test) ---------- */

async function rest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE,
      authorization: `Bearer ${SERVICE}`,
      "content-type": "application/json",
      ...init.headers,
    },
  });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

export interface TestCustomer {
  id: string;
  shortCode: string;
  qr: string;
}

/** Cliente nuovo (iscrizione tramite la funzione di dominio, come dal web). */
export async function newCustomer(shopId: string, name = "Zefiro Prova", marketing = false): Promise<TestCustomer> {
  const phone = `+39347${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`;
  const r = await rest<{ customer_id: string; short_code: string; qr_token: string }>("rpc/enroll_customer", {
    method: "POST",
    body: JSON.stringify({
      p_shop_id: shopId,
      p_name: name,
      p_phone: phone,
      p_consent_privacy: true,
      p_consent_marketing: marketing,
      p_meta: { actor_type: "customer" },
    }),
  });
  return { id: r.customer_id, shortCode: r.short_code, qr: r.qr_token };
}

export async function balance(customerId: string): Promise<{ stamps: number; rewards_available: number }> {
  const rows = await rest<Array<{ stamps: number; rewards_available: number }>>(
    `customers?id=eq.${customerId}&select=stamps,rewards_available`,
  );
  return rows[0]!;
}

export async function stampCount(customerId: string): Promise<number> {
  const rows = await rest<unknown[]>(`stamp_events?customer_id=eq.${customerId}&kind=eq.stamp&select=id`);
  return rows.length;
}

export async function stampsRequired(shopId: string): Promise<number> {
  const rows = await rest<Array<{ stamps_required: number }>>(`shops?id=eq.${shopId}&select=stamps_required`);
  return rows[0]!.stamps_required;
}

/** Operatore Marco su un negozio, scanner aperto nella modalità indicata. */
export async function openScanner(
  page: Page,
  shop: "salone-demo" | "barbiere-demo",
  mode: "lettore" | "manuale" | "fotocamera",
) {
  await login(page, OPERATOR);
  await page.getByTestId(`negozio-${shop}`).click();
  await expect(page).toHaveURL(/\/scanner$/);
  await page.getByTestId(`modalita-${mode}`).click();
}

/** Il lettore USB "digita" il codice e preme Invio. */
export async function readerScan(page: Page, code: string) {
  await expect(page.getByTestId("campo-lettore")).toBeFocused();
  await page.keyboard.type(code, { delay: 5 });
  await page.keyboard.press("Enter");
}

/** Lettura o modifica diretta di una tabella (service role, solo nei test). */
export const restSelect = <T>(path: string) => rest<T>(path);
export const restPatch = (path: string, body: Record<string, unknown>) =>
  rest<unknown>(path, { method: "PATCH", body: JSON.stringify(body), headers: { prefer: "return=representation" } });
export const restDelete = (path: string) =>
  rest<unknown>(path, { method: "DELETE", headers: { prefer: "return=representation" } });

/** Elimina un utente di Supabase Auth creato da un test (inviti dello staff). */
export async function deleteAuthUser(userId: string) {
  await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
    method: "DELETE",
    headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}` },
  });
}

/** PNG valido di 1×1 pixel: il logo viene ritagliato e ridimensionato dall'app prima del caricamento. */
export const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

/** Chiamata a una funzione Postgres (service role, solo nei test). */
export const rpcCall = <T>(fn: string, body: Record<string, unknown>) =>
  rest<T>(`rpc/${fn}`, { method: "POST", body: JSON.stringify(body) });
