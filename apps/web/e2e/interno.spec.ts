import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { newRequestId, supportCodeFromRequestId } from "@loyalty/shared/logging/request-id";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { generate } from "otplib";
import { SUPPORT_FILE } from "./global-setup";
import { admin } from "./helpers";

/*
 * Pannello interno (Fase 9): accesso solo al team con 2FA e prova «assistenza alla cieca».
 * Per ogni problema simulato dalla DoD (credenziali Google errate, cooldown, QR di un altro negozio,
 * rete assente nell'app) il test parte SOLO dal codice che l'esercente legge sullo schermo e deve
 * arrivare a causa e azione nella vista Assistenza, in meno di un minuto.
 */

const SALONE = "11111111-1111-4111-8111-111111111111";
const BARBIERE = "44444444-4444-4444-8444-444444444444";
const creds = () =>
  JSON.parse(readFileSync(SUPPORT_FILE, "utf8")) as { email: string; password: string; secret: string };

let lastCode = "";
/** Accesso con password e codice dell'app di autenticazione (un codice TOTP vale una volta sola). */
async function login(page: Page) {
  const c = creds();
  await page.goto("/interno/accesso");
  await page.getByTestId("accesso-email").fill(c.email);
  await page.getByTestId("accesso-password").fill(c.password);
  await page.getByTestId("accesso-invia").click();
  await expect(page).toHaveURL(/\/interno\/accesso\/codice$/);
  let code = await generate({ secret: c.secret });
  while (code === lastCode) {
    await page.waitForTimeout(1000);
    code = await generate({ secret: c.secret });
  }
  lastCode = code;
  await page.getByTestId("codice-valore").fill(code);
  await page.getByTestId("codice-invia").click();
  await expect(page).toHaveURL(/\/interno$/);
}

async function staffToken(): Promise<string> {
  const sb = createClient(process.env.E2E_SUPABASE_URL!, process.env.E2E_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });
  const { data, error } = await sb.auth.signInWithPassword({
    email: "staff@salone-demo.test",
    password: "password-demo-locale",
  });
  if (error) throw error;
  return data.session.access_token;
}

async function merchant(
  request: APIRequestContext,
  path: string,
  body: unknown,
  opts: { shop?: string; key?: boolean } = {},
) {
  const res = await request.post(`/api/v1/merchant${path}`, {
    headers: {
      authorization: `Bearer ${await staffToken()}`,
      "x-shop-id": opts.shop ?? SALONE,
      "x-platform": "web",
      "x-app-version": "0.1.0",
      ...(opts.key && { "idempotency-key": randomUUID() }),
    },
    data: body,
  });
  return {
    status: res.status(),
    json: (await res.json()) as Record<string, unknown>,
    requestId: res.headers()["x-request-id"]!,
  };
}

async function newCard(shopId: string) {
  const phone = `+39347${String(Date.now()).slice(-7)}`;
  const { data, error } = await admin.rpc("enroll_customer", {
    p_shop_id: shopId,
    p_name: "Prova Assistenza",
    p_phone: phone,
    p_consent_privacy: true,
    p_consent_marketing: false,
    p_meta: { actor_type: "system" },
  });
  if (error) throw error;
  const { data: c } = await admin.from("customers").select("id, qr_token").eq("id", data.customer_id).single();
  return c as { id: string; qr_token: string };
}

/** La copia dei log in Postgres arriva subito dopo la risposta (e dopo il lavoro verso i wallet). */
async function waitForLog(requestId: string, event: string) {
  await expect
    .poll(
      async () => {
        const { data } = await admin.from("log_events").select("event").eq("request_id", requestId);
        return (data ?? []).map((r) => r.event);
      },
      { timeout: 15_000 },
    )
    .toContain(event);
}

/** Dalla ricerca del codice alla spiegazione dell'errore: controlla codice, azione e tempo. */
async function diagnose(page: Page, supportCode: string, errorCode: string, action: RegExp) {
  const started = Date.now();
  await page.goto("/interno");
  await page.getByTestId("cerca").fill(supportCode);
  await page.getByTestId("cerca-invia").click();
  const explanation = page.getByTestId("errore-catalogo").filter({ hasText: errorCode }).first();
  await expect(explanation).toBeVisible();
  await expect(explanation.getByTestId("errore-azione")).toContainText(action);
  expect(Date.now() - started).toBeLessThan(60_000);
}

test.describe.configure({ mode: "serial", timeout: 90_000 });

test.describe("accesso", () => {
  test("senza sessione si finisce all'accesso", async ({ page }) => {
    for (const path of ["/interno", "/interno/negozi", "/interno/diagnostica", `/interno/negozi/${SALONE}`]) {
      await page.goto(path);
      await expect(page, path).toHaveURL(/\/interno\/accesso$/);
    }
    const res = await page.request.post(`/interno/clienti/${randomUUID()}/esporta`, { data: { reason: "prova" } });
    expect(res.status()).toBe(401);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("E_SUPPORT_UNAUTHORIZED");
  });

  test("l'account di un esercente non entra", async ({ page }) => {
    await page.goto("/interno/accesso");
    await page.getByTestId("accesso-email").fill("staff@salone-demo.test");
    await page.getByTestId("accesso-password").fill("password-demo-locale");
    await page.getByTestId("accesso-invia").click();
    await expect(page.locator(".int-notice-error")).toContainText("non fa parte del team interno");
    await page.goto("/interno");
    await expect(page).toHaveURL(/\/interno\/accesso$/);
  });

  test("password giusta senza codice: il pannello resta chiuso", async ({ page }) => {
    const c = creds();
    await page.goto("/interno/accesso");
    await page.getByTestId("accesso-email").fill(c.email);
    await page.getByTestId("accesso-password").fill(c.password);
    await page.getByTestId("accesso-invia").click();
    await expect(page).toHaveURL(/\/interno\/accesso\/codice$/);
    await page.goto("/interno/negozi");
    await expect(page).toHaveURL(/\/interno\/accesso\/codice$/);
    await page.getByTestId("codice-valore").fill("000000");
    await page.getByTestId("codice-invia").click();
    await expect(page.locator(".int-notice-error")).toContainText("non corretti");
  });

  test("con password e codice si entra; Esci chiude la sessione", async ({ page }) => {
    await login(page);
    await expect(page.getByRole("heading", { name: "Assistenza" })).toBeVisible();
    await page.getByTestId("esci").click();
    await expect(page).toHaveURL(/\/interno\/accesso$/);
    await page.goto("/interno");
    await expect(page).toHaveURL(/\/interno\/accesso$/);
  });
});

test.describe("pannello con un accesso solo (un codice TOTP vale una volta)", () => {
  let page: Page;
  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await login(page);
  });
  test.afterAll(async () => {
    await page.close();
  });

  test("alla cieca: credenziali Google errate", async ({ request }) => {
    const card = await newCard(SALONE);
    const r = await merchant(request, "/stamp", { customerId: card.id }, { key: true });
    expect(r.status).toBe(200);
    await waitForLog(r.requestId, "wallet.google.patch.failed");
    await diagnose(page, supportCodeFromRequestId(r.requestId), "E_GOOGLE_AUTH", /GOOGLE_WALLET_SA_KEY_B64/);
  });

  test("alla cieca: cooldown tra due timbri", async ({ request }) => {
    const card = await newCard(SALONE);
    await merchant(request, "/stamp", { customerId: card.id }, { key: true });
    const r = await merchant(request, "/stamp", { customerId: card.id }, { key: true });
    expect(r.status).toBe(409);
    const code = (r.json.error as { support_code: string }).support_code;
    await waitForLog(r.requestId, "http.request.end");
    await diagnose(page, code, "E_STAMP_COOLDOWN", /rettificare il saldo|tempo minimo/);
  });

  test("alla cieca: QR di un altro negozio", async ({ request }) => {
    const other = await newCard(BARBIERE);
    const r = await merchant(request, "/scan/lookup", { code: other.qr_token });
    expect((r.json.error as { code: string }).code).toBe("E_QR_OTHER_SHOP");
    const code = (r.json.error as { support_code: string }).support_code;
    await waitForLog(r.requestId, "http.request.end");
    await diagnose(page, code, "E_QR_OTHER_SHOP", /.+/);
  });

  test("alla cieca: rete assente nell'app, il codice è solo nel pacchetto di diagnostica", async ({ request }) => {
    const requestId = newRequestId();
    const code = supportCodeFromRequestId(requestId);
    const sent = await merchant(request, "/diagnostics", {
      device: { os: "Android 15", model: "Pixel 7" },
      events: [
        { ts: new Date().toISOString(), level: "info", event: "app.offline", msg: "Connessione persa." },
        {
          ts: new Date().toISOString(),
          level: "warn",
          event: "app.api.error",
          msg: "Chiamata POST /stamp fallita: il server non ha risposto (rete assente).",
          request_id: requestId,
          error_code: "E_NETWORK",
          support_code: code,
        },
      ],
    });
    expect(sent.status).toBe(200);
    await diagnose(page, code, "E_NETWORK", /.+/);
    await expect(page.getByText("App: Chiamata POST /stamp fallita").first()).toBeVisible();
  });

  test("negozi: crea e sospendi un negozio dal pannello", async () => {
    const slug = `e2e-${Date.now().toString(36)}`;
    await page.goto("/interno/negozi/nuovo");
    await page.getByTestId("negozio-nome").fill("Negozio E2E");
    await page.getByTestId("negozio-slug").fill(slug);
    await page.getByTestId("titolare-nome").fill("Luca");
    await page.getByTestId("titolare-email").fill(`${slug}@esempio.test`);
    await page.getByTestId("crea-negozio-invia").click();
    await expect(page.getByTestId("negozio-titolo")).toHaveText("Negozio E2E");
    await expect(page.getByTestId("negozio-stato")).toHaveText("attivo");

    await page.getByTestId("stato-motivo").fill("prova di sospensione");
    await page.getByRole("button", { name: "Sospendi" }).click();
    await page.getByTestId("stato-negozio-invia").click();
    await expect(page.getByTestId("negozio-stato")).toHaveText("sospeso");
    const res = await page.request.get(`/${slug}`);
    expect(await res.text()).toContain("sospes");

    const { data: shop } = await admin.from("shops").select("id").eq("slug", slug).single();
    const { data: owner } = await admin.from("staff").select("user_id").eq("shop_id", shop!.id).single();
    await admin.from("shops").delete().eq("id", shop!.id);
    await admin.auth.admin.deleteUser(owner!.user_id as string);
  });
});
