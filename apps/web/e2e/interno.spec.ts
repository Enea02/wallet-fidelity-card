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
/** Codice TOTP nuovo (un codice vale una volta sola: se è uguale all'ultimo si aspetta il prossimo). */
async function freshCode(page: Page, secret: string): Promise<string> {
  let code = await generate({ secret });
  while (code === lastCode) {
    await page.waitForTimeout(1000);
    code = await generate({ secret });
  }
  lastCode = code;
  return code;
}

/** Login unico con password e codice dell'app di autenticazione, partendo dal pannello. */
async function login(page: Page) {
  const c = creds();
  await page.goto("/interno");
  await expect(page).toHaveURL(/\/accesso\?dest=interno$/);
  await page.getByTestId("accesso-email").fill(c.email);
  await page.getByTestId("accesso-password").fill(c.password);
  await page.getByTestId("accesso-invia").click();
  await expect(page).toHaveURL(/\/accesso\/codice\?dest=interno$/);
  await page.getByTestId("codice-valore").fill(await freshCode(page, c.secret));
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
  await page.goto("/interno/assistenza");
  await page.getByTestId("cerca").fill(supportCode);
  await page.getByTestId("cerca-invia").click();
  const explanation = page.getByTestId("errore-catalogo").filter({ hasText: errorCode }).first();
  await expect(explanation).toBeVisible();
  await expect(explanation.getByTestId("errore-azione")).toContainText(action);
  expect(Date.now() - started).toBeLessThan(60_000);
}

test.describe.configure({ mode: "serial", timeout: 90_000 });

test.describe("accesso", () => {
  test("senza sessione si finisce al login unico", async ({ page }) => {
    for (const path of ["/interno", "/interno/negozi", "/interno/diagnostica", `/interno/negozi/${SALONE}`]) {
      await page.goto(path);
      await expect(page, path).toHaveURL(/\/accesso\?dest=interno$/);
    }
    // il vecchio indirizzo dell'accesso porta al login unico
    await page.goto("/interno/accesso");
    await expect(page).toHaveURL(/\/accesso\?dest=interno$/);
    const res = await page.request.post(`/interno/clienti/${randomUUID()}/esporta`, { data: { reason: "prova" } });
    expect(res.status()).toBe(401);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("E_SUPPORT_UNAUTHORIZED");
  });

  test("l'account di un esercente entra nella sua app, non nel pannello", async ({ page }) => {
    await page.goto("/interno");
    await page.getByTestId("accesso-email").fill("staff@salone-demo.test");
    await page.getByTestId("accesso-password").fill("password-demo-locale");
    await page.getByTestId("accesso-invia").click();
    // niente secondo fattore per lo staff: dritto nella web app esercente
    await expect(page).toHaveURL(/\/app$/);
    await page.goto("/interno");
    await expect(page).toHaveURL(/\/accesso\?errore=team$/);
    await expect(page.locator(".int-notice-error")).toContainText("non fa parte del team interno");
  });

  test("un account senza negozi né team non apre nessuna sessione", async ({ page }) => {
    const email = `nessuno-${Date.now()}@loyaltywallet.test`;
    const { data } = await admin.auth.admin.createUser({ email, password: "password-di-prova-1", email_confirm: true });
    try {
      await page.goto("/accesso");
      await page.getByTestId("accesso-email").fill(email);
      await page.getByTestId("accesso-password").fill("password-di-prova-1");
      await page.getByTestId("accesso-invia").click();
      await expect(page.locator(".int-notice-error")).toContainText("non è collegato a nessun negozio");
      await expect(page).toHaveURL(/\/accesso$/);
      expect((await page.context().cookies()).some((c) => /^sb-.+-auth-token/.test(c.name))).toBe(false);
    } finally {
      if (data.user) await admin.auth.admin.deleteUser(data.user.id);
    }
  });

  test("password giusta senza codice: il pannello resta chiuso", async ({ page }) => {
    const c = creds();
    await page.goto("/accesso");
    await page.getByTestId("accesso-email").fill(c.email);
    await page.getByTestId("accesso-password").fill(c.password);
    await page.getByTestId("accesso-invia").click();
    await expect(page).toHaveURL(/\/accesso\/codice$/);
    await page.goto("/interno/negozi");
    await expect(page).toHaveURL(/\/accesso\/codice\?dest=interno$/);
    await page.getByTestId("codice-valore").fill("000000");
    await page.getByTestId("codice-invia").click();
    await expect(page.locator(".int-notice-error")).toContainText("non corretti");
  });

  test("con password e codice si entra; Esci chiude la sessione", async ({ page }) => {
    await login(page);
    // si arriva sulla Panoramica; la ricerca in alto porta alla vista Assistenza
    await expect(page.getByTestId("panoramica-titolo")).toContainText("Assistenza E2E");
    await expect(page.getByTestId("panoramica-indicatori")).toContainText("Negozi attivi");
    await page.getByTestId("cerca-globale").fill("salone-demo");
    await page.getByTestId("cerca-globale").press("Enter");
    await expect(page).toHaveURL(/\/interno\/assistenza\?q=salone-demo$/);
    await expect(page.getByTestId("risultati")).toContainText("Salone Demo");
    await page.getByTestId("esci").click();
    await expect(page).toHaveURL(/\/accesso$/);
    await page.goto("/interno");
    await expect(page).toHaveURL(/\/accesso\?dest=interno$/);
  });

  test("team e staff di un negozio: dopo il codice si sceglie dove entrare, Esci vale per entrambi", async ({
    page,
  }) => {
    const email = `doppio-${Date.now()}@loyaltywallet.test`;
    const password = "password-doppio-ruolo";
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !data.user) throw error ?? new Error("utente non creato");
    const userId = data.user.id;
    try {
      const add = await admin.rpc("support_member_add", {
        p_user_id: userId,
        p_display_name: "Doppio Ruolo",
        p_email: email,
        p_meta: { actor_type: "support", actor_id: "e2e", platform: "script" },
      });
      if (add.error) throw add.error;
      const staff = await admin
        .from("staff")
        .insert({ user_id: userId, shop_id: SALONE, role: "operator", display_name: "Doppio" });
      if (staff.error) throw staff.error;
      // app di autenticazione già collegata, come per il membro del team del setup
      const sb = createClient(process.env.E2E_SUPABASE_URL!, process.env.E2E_SUPABASE_ANON_KEY!, {
        auth: { persistSession: false },
      });
      await sb.auth.signInWithPassword({ email, password });
      const enrolled = await sb.auth.mfa.enroll({ factorType: "totp", friendlyName: "e2e" });
      if (enrolled.error) throw enrolled.error;
      const secret = enrolled.data.totp.secret;
      await sb.auth.mfa.challengeAndVerify({ factorId: enrolled.data.id, code: await freshCode(page, secret) });

      await page.goto("/accesso");
      await page.getByTestId("accesso-email").fill(email);
      await page.getByTestId("accesso-password").fill(password);
      await page.getByTestId("accesso-invia").click();
      await expect(page).toHaveURL(/\/accesso\/codice$/);
      await page.getByTestId("codice-valore").fill(await freshCode(page, secret));
      await page.getByTestId("codice-invia").click();
      await expect(page).toHaveURL(/\/accesso\/scegli$/);
      await expect(page.getByRole("heading", { name: "Dove vuoi entrare?" })).toBeVisible();

      await page.getByTestId("scegli-app-invia").click();
      await expect(page).toHaveURL(/\/app$/);
      // stessa sessione: il pannello si apre senza rifare l'accesso
      await page.goto("/interno");
      await expect(page).toHaveURL(/\/interno$/);
      await expect(page.getByTestId("panoramica-titolo")).toContainText("Doppio Ruolo");

      // Esci dal pannello chiude anche la web app esercente (API con il cookie: 401)
      await page.getByTestId("esci").click();
      await expect(page).toHaveURL(/\/accesso$/);
      const me = await page.request.get("/api/v1/merchant/me");
      expect(me.status()).toBe(401);
    } finally {
      await admin.from("staff").delete().eq("user_id", userId);
      await admin.auth.admin.deleteUser(userId);
    }
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

  test("alla cieca: tessera prepagata non ancora attivata", async ({ request }) => {
    const { data: product, error } = await admin.rpc("prepaid_product_save", {
      p_shop_id: SALONE,
      p_product_id: null,
      p_fields: {
        code: `cieca-${Date.now() % 100000}`,
        name: "Tessera fotocopie",
        units: 150,
        unit_singular: "pagina",
        unit_plural: "pagine",
      },
      p_meta: { actor_type: "staff", actor_id: "22222222-2222-4222-8222-222222222222" },
    });
    if (error) throw error;
    const { data: card, error: e2 } = await admin.rpc("prepaid_enroll", {
      p_product_id: product.id,
      p_name: "Tina Tessera",
      p_phone: `+39347${String(Date.now()).slice(-7)}`,
      p_consent_privacy: true,
      p_consent_marketing: false,
      p_meta: {},
    });
    if (e2) throw e2;
    try {
      const r = await merchant(request, "/prepaid/consume", { cardId: card.card_id, quantity: 1 }, { key: true });
      expect((r.json.error as { code: string }).code).toBe("E_PREPAID_NOT_ACTIVE");
      await waitForLog(r.requestId, "prepaid.consume.rejected_inactive");
      await diagnose(page, (r.json.error as { support_code: string }).support_code, "E_PREPAID_NOT_ACTIVE", /Attiva/);
    } finally {
      await admin.from("customers").delete().eq("id", card.customer_id);
      await admin.from("prepaid_products").delete().eq("id", product.id);
    }
  });

  test("alla cieca: punti chiesti in un negozio a timbri (Fase 9.6)", async ({ request }) => {
    const card = await newCard(SALONE);
    const r = await merchant(request, "/points/add", { customerId: card.id, amountCents: 2350 }, { key: true });
    expect((r.json.error as { code: string }).code).toBe("E_POINTS_MODE_REQUIRED");
    await waitForLog(r.requestId, "http.request.end");
    await diagnose(
      page,
      (r.json.error as { support_code: string }).support_code,
      "E_POINTS_MODE_REQUIRED",
      /modalità timbri\/punti/,
    );
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

    // nell'elenco a card: tra i sospesi, con la data e il motivo della sospensione
    await page.goto(`/interno/negozi?stato=sospesi&q=${slug}`);
    const card = page.getByTestId(`negozio-${slug}`);
    await expect(card).toContainText("sospeso");
    await expect(card).toContainText("prova di sospensione");
    await page.goto(`/interno/negozi?stato=attivi&q=${slug}`);
    await expect(page.getByTestId(`negozio-${slug}`)).toHaveCount(0);

    const { data: shop } = await admin.from("shops").select("id").eq("slug", slug).single();
    const { data: owner } = await admin.from("staff").select("user_id").eq("shop_id", shop!.id).single();
    await admin.from("shops").delete().eq("id", shop!.id);
    await admin.auth.admin.deleteUser(owner!.user_id as string);
  });
});
