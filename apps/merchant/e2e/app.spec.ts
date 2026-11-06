import { expect, test } from "@playwright/test";
import {
  accessToken,
  API,
  emailLink,
  expectLogLine,
  login,
  OPERATOR,
  OWNER,
  SALONE,
  serverLog,
  tamperSession,
} from "./helpers";

/*
 * Web app esercente su telefono (Pixel 7): accesso dal login unico (/accesso), negozi, ruoli, errori
 * con codice assistenza, diagnostica, rete assente, sessione scaduta, invito e recupero password via email.
 */

test("operatore: scelta del negozio, solo scanner e profilo, cambio negozio ricordato", async ({ page }) => {
  await login(page, OPERATOR);
  await expect(page.getByText("Dove lavori oggi?")).toBeVisible();
  await page.getByTestId("negozio-salone-demo").click();
  await expect(page).toHaveURL(/\/scanner$/);
  await expect(page.getByTestId("tab-scanner")).toBeVisible();
  await expect(page.getByTestId("tab-profilo")).toBeVisible();
  await expect(page.getByTestId("tab-clienti")).toHaveCount(0);

  // le sezioni del titolare non si aprono nemmeno scrivendo l'indirizzo
  await page.goto("/app/clienti");
  await expect(page).toHaveURL(/\/scanner$/);

  await page.getByTestId("tab-profilo").click();
  await expect(page.getByTestId("profilo-negozio")).toHaveText("Salone Demo");
  await expect(page.getByTestId("profilo-ruolo")).toHaveText("operatore");
  await page.getByTestId("cambia-negozio").click();
  await page.getByTestId("negozio-barbiere-demo").click();
  await page.getByTestId("tab-profilo").click();
  await expect(page.getByTestId("profilo-negozio")).toHaveText("Barbiere Demo");

  // riaprendo l'app il negozio è quello dell'ultima volta
  await page.goto("/app");
  await expect(page).toHaveURL(/\/scanner$/);
  await page.getByTestId("tab-profilo").click();
  await expect(page.getByTestId("profilo-negozio")).toHaveText("Barbiere Demo");

  // Esci chiude la sessione web: si torna al login unico e /app non si apre più
  await page.getByTestId("esci").click();
  await expect(page).toHaveURL(/\/accesso\?dest=app/);
  await page.goto("/app/scanner");
  await expect(page).toHaveURL(/\/accesso\?/);
  const line = await expectLogLine((l) => l.event === "auth.logout" && l.from === "app");
  expect(line.level).toBe("info");
});

test("credenziali sbagliate: messaggio chiaro, nessun accesso", async ({ page }) => {
  await login(page, OPERATOR, "password-sbagliata");
  await expect(page.getByText("Email o password non corrette.")).toBeVisible();
  await expect(page).toHaveURL(/\/accesso\?/);
  await expectLogLine((l) => l.event === "auth.login.failed" && l.reason === "email o password non corrette");
});

test("login unico: dopo l'accesso si torna alla pagina dell'app da cui si era partiti", async ({ page }) => {
  await login(page, OWNER, undefined, "/app/clienti");
  await expect(page).toHaveURL(/\/app\/clienti$/);
  // la sessione è nei cookie httpOnly: niente token leggibili dagli script della pagina
  const stored = await page.evaluate(() => JSON.stringify(localStorage) + document.cookie);
  expect(stored).not.toMatch(/eyJ[\w-]{10,}\.[\w-]{10,}/);
  // con la sessione aperta /accesso porta subito all'app
  await page.goto("/accesso");
  await expect(page).toHaveURL(/\/app(\/[a-z]+)?$/);
});

test("errore forzato: codice assistenza in app e riga corrispondente nel log del backend", async ({ page }) => {
  await login(page, OWNER);
  await expect(page).toHaveURL(/\/panoramica$/);
  await page.getByTestId("apri-profilo").click();
  await page.getByTestId("forza-errore").click();
  await expect(page.getByTestId("messaggio-errore")).toHaveText("Carta non trovata per questo negozio.");
  const code = ((await page.getByTestId("codice-assistenza").textContent()) ?? "").replace(/Copia(to)?$/, "");
  expect(code).toMatch(/^ERR-[0-9A-Z]{5}$/);

  const line = await expectLogLine((l) => l.event === "http.request.end" && l.support_code === code);
  expect(line).toMatchObject({
    status: 404,
    error_code: "E_CARD_NOT_FOUND",
    platform: "web",
    route: "/api/v1/merchant/stamp",
  });
});

test("invia diagnostica: il backend riceve il pacchetto e l'app mostra il ticket", async ({ page }) => {
  await login(page, OWNER);
  await page.getByTestId("apri-profilo").click();
  await page.getByTestId("invia-diagnostica").click();
  await expect(page.getByText("Diagnostica inviata")).toBeVisible();
  const ticket = ((await page.getByTestId("codice-assistenza").textContent()) ?? "").replace(/Copia(to)?$/, "");
  expect(ticket).toMatch(/^DIAG-/);
  const line = await expectLogLine((l) => l.event === "diagnostics.received" && l.ticket_code === ticket);
  expect(Number(line.events_count)).toBeGreaterThan(0);
});

test('offline: banner "Sei offline" e azioni che richiedono il server bloccate', async ({ page, context }) => {
  await login(page, OWNER);
  await page.getByTestId("apri-profilo").click();
  await context.setOffline(true);
  await expect(page.getByTestId("banner-offline")).toBeVisible();
  await expect(page.getByTestId("invia-diagnostica")).toBeDisabled();
  await context.setOffline(false);
  await expect(page.getByTestId("banner-offline")).toHaveCount(0);
  await expect(page.getByTestId("invia-diagnostica")).toBeEnabled();
});

test("token scaduto: il server rinnova la sessione da solo; se è impossibile si torna all'accesso", async ({
  page,
}) => {
  await login(page, OWNER);
  await expect(page).toHaveURL(/\/panoramica$/);

  const past = Math.floor(Date.now() / 1000) - 60;
  await tamperSession(page, { access_token: "token-scaduto", expires_at: past });
  await page.reload();
  await expect(page).toHaveURL(/\/panoramica$/);
  await expect(page.getByText("Buon", { exact: false }).first()).toBeVisible();

  await tamperSession(page, { access_token: "token-scaduto", refresh_token: "rinnovo-non-valido", expires_at: past });
  await page.reload();
  await expect(page).toHaveURL(/\/accesso\?.*errore=sessione/);
  await expect(page.getByText("La sessione è scaduta. Accedi di nuovo.")).toBeVisible();
});

test("invito via email, prima password, poi recupero password", async ({ page }) => {
  const email = `e2e-${Date.now()}@esempio.test`;
  const res = await fetch(`${API}/api/v1/merchant/staff/invite`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${await accessToken(OWNER)}`,
      "x-shop-id": SALONE,
      "content-type": "application/json",
    },
    body: JSON.stringify({ email, displayName: "Zefiro Prova", role: "operator" }),
  });
  expect(res.status).toBe(200);

  await page.goto(await emailLink(email, /invito/i));
  await expect(page).toHaveURL(/\/invito$/); // i token del link non restano nell'indirizzo
  await expect(page.getByText(`con ${email}`, { exact: false })).toBeVisible();
  await page.getByLabel("Password", { exact: true }).fill("una-password-nuova");
  await page.getByLabel("Ripeti la password").fill("una-password-nuova");
  await page.getByText("Salva e entra").click();
  await expect(page).toHaveURL(/\/scanner$/);

  await page.getByTestId("tab-profilo").click();
  await expect(page.getByTestId("profilo-ruolo")).toHaveText("operatore");
  // la sessione del link è passata ai cookie del server (login unico)
  await expectLogLine((l) => l.event === "auth.session.handoff" && l.reason === "invito");
  await page.getByTestId("esci").click();
  await expect(page).toHaveURL(/\/accesso\?/);

  await page.getByText("Password dimenticata?").click();
  await page.getByTestId("campo-email-recupero").fill(email);
  await page.getByText("Inviami il link").click();
  await expect(page.getByText("Controlla la posta")).toBeVisible();
  await page.goto(await emailLink(email, /nuova password/i));
  await expect(page).toHaveURL(/\/nuova-password$/);
  await page.getByLabel("Password", { exact: true }).fill("ancora-un-altra");
  await page.getByLabel("Ripeti la password").fill("ancora-un-altra");
  await page.getByText("Salva la password").click();
  await expect(page).toHaveURL(/\/scanner$/);

  // il backend ha registrato l'invito senza l'email in chiaro e nessun JWT è finito nel log
  const text = serverLog()
    .map((l) => JSON.stringify(l))
    .join("\n");
  expect(text).not.toContain(email);
  expect(text).not.toMatch(/eyJ[\w-]{10,}\.[\w-]{10,}/);
});
