import { expect, test } from "@playwright/test";
import { NAME, UA, admin, fillAndSubmit, newPhone, typeCode, unsubscribeToken } from "./helpers";

/*
 * Iscrizione del cliente dal telefono (Android, Pixel 7) e casi del brief: cliente nuovo, di ritorno,
 * codice errato, troppi tentativi, negozio sospeso; più negozio inesistente, computer, iPhone,
 * disiscrizione. Ogni test controlla che nessun URL contenga telefono o nome.
 */

const used: string[] = [];

test.beforeEach(async ({ page }) => {
  page.on("request", (r) => used.push(r.url()));
});
test.afterEach(() => {
  for (const url of used.splice(0)) {
    expect(url, "nessun dato personale negli URL").not.toMatch(/3470\d{6}|Zefiro|Prova/);
  }
});
test.afterAll(async () => {
  await admin.from("customers").delete().like("name", `${NAME}%`);
});

test("cliente nuovo da Android: codice, carta pronta e pulsante Google Wallet", async ({ page }) => {
  await fillAndSubmit(page, "salone-demo", newPhone());
  await expect(page.getByText(/Abbiamo mandato un codice di 6 cifre al \+39 347 0\d{2} \d{4}/)).toBeVisible();
  await expect(page.getByText(/Nuovo codice tra 0:\d\d/)).toBeVisible();
  await typeCode(page, "123456");
  await expect(page.getByRole("heading", { name: "Ciao Zefiro, la tua carta è pronta." })).toBeVisible();
  await expect(page.getByText("0 / 10")).toBeVisible();
  const badge = page.getByRole("link", { name: "Aggiungi a Google Wallet" });
  await expect(badge).toHaveAttribute("href", /^https:\/\/pay\.google\.com\/gp\/v\/save\/eyJ/);
  await expect(page.getByRole("img", { name: "Aggiungi a Google Wallet" })).toHaveAttribute(
    "src",
    "/brand/aggiungi-a-google-wallet.svg",
  );
});

test("negozio a punti: frase dei punti, niente griglia, carta pronta con livello (Fase 9.6)", async ({ page }) => {
  await page.goto("/bar-punti-demo");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("1 punto per ogni euro: da 100 punti sei Gold.");
  await expect(page.locator("img.lw-strip")).toHaveCount(0);
  await fillAndSubmit(page, "bar-punti-demo", newPhone());
  await typeCode(page, "123456");
  await expect(page.getByRole("heading", { name: "Ciao Zefiro, la tua carta è pronta." })).toBeVisible();
  await expect(page.getByTestId("punti-saldo")).toHaveText("0 punti");
  await expect(page.getByTestId("punti-livello")).toHaveText("Sei Silver · 0 punti");
  await expect(page.getByText("Ancora 100 punti per diventare Gold.")).toBeVisible();
});

test("abbonamento: pagina con il vantaggio, tessera da attivare in negozio (Fase 9.6)", async ({ page }) => {
  const { data: product, error } = await admin.rpc("prepaid_product_save", {
    p_shop_id: "11111111-1111-4111-8111-111111111111",
    p_product_id: null,
    p_fields: {
      code: `socio-${Date.now() % 100000}`,
      name: "Socio 12 mesi",
      kind: "abbonamento",
      benefit: "accesso illimitato",
      validity_months: 12,
    },
    p_meta: { actor_type: "staff", actor_id: "22222222-2222-4222-8222-222222222222" },
  });
  if (error) throw error;
  try {
    await page.goto(`/salone-demo/t/${product.code as string}`);
    await expect(page.getByTestId("tessera-titolo")).toHaveText("Accesso illimitato, con la tessera sul telefono.");
    await expect(page.getByText(/il rinnovo in negozio allunga dalla scadenza/)).toBeVisible();
    await page.getByLabel("Nome").fill(NAME);
    await page.getByLabel("Telefono").fill(newPhone());
    await page.getByRole("checkbox", { name: /Accetto l'informativa privacy/ }).check();
    await page.getByRole("button", { name: "Crea la mia tessera" }).click();
    await typeCode(page, "123456");
    await expect(page.getByTestId("tessera-stato")).toHaveText("Da attivare in negozio");
    await expect(page.locator("p.lw-lead")).toContainText("Paga l'abbonamento in cassa: lo attiviamo subito.");
  } finally {
    await admin.from("prepaid_cards").delete().eq("product_id", product.id);
    await admin.from("prepaid_products").delete().eq("id", product.id);
  }
});

test.describe("da computer", () => {
  test.use({ userAgent: UA.desktop, viewport: { width: 1280, height: 900 }, isMobile: false, hasTouch: false });
  test("QR per aprire la carta sul telefono, che porta al Salva in Google Wallet", async ({ page }) => {
    await fillAndSubmit(page, "salone-demo", newPhone());
    const verified = page.waitForResponse((r) => r.url().endsWith("/api/public/enroll/verify"));
    await typeCode(page, "123456");
    const { phoneLink } = (await (await verified).json()) as { phoneLink: string };
    await expect(page.getByRole("img", { name: "QR per aprire la carta sul telefono" })).toBeVisible();
    await expect(page.getByText("Inquadra il QR con il telefono per salvare la carta nel wallet.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Aggiungi a Google Wallet" })).toBeVisible();

    // il QR contiene il link breve firmato: aperto dal telefono porta al "Salva in Google Wallet"
    expect(phoneLink).toMatch(/^http:\/\/localhost:3100\/salone-demo\/c\/[\w-]+\.[\w-]+$/);
    const res = await page.request.get(phoneLink, { maxRedirects: 0 });
    expect(res.status()).toBeGreaterThanOrEqual(300);
    expect(res.headers().location).toMatch(/^https:\/\/pay\.google\.com\/gp\/v\/save\//);
    const bad = await page.request.get(`${phoneLink.slice(0, -4)}xxxx`);
    expect(await bad.text()).toContain("Link scaduto");
  });
});

test("cliente di ritorno: stessa carta con i timbri conservati", async ({ page }) => {
  const phone = newPhone();
  await fillAndSubmit(page, "salone-demo", phone);
  await typeCode(page, "123456");
  await expect(page.getByRole("heading", { name: /la tua carta è pronta/ })).toBeVisible();
  await admin.from("customers").update({ stamps: 6 }).eq("phone", `+39${phone}`);

  await fillAndSubmit(page, "salone-demo", phone);
  await typeCode(page, "123456");
  await expect(page.getByRole("heading", { name: "Ciao Zefiro, hai già una carta qui: eccola." })).toBeVisible();
  await expect(page.getByText("6 / 10")).toBeVisible();
  await expect(page.getByText("I tuoi timbri sono conservati.", { exact: false })).toBeVisible();
});

test("codice errato e troppi tentativi", async ({ page }) => {
  await fillAndSubmit(page, "salone-demo", newPhone());
  await typeCode(page, "000000");
  await expect(page.getByText("Codice non corretto. Ti restano 4 tentativi.")).toBeVisible();
  await expect(page.getByText("Dopo 5 errori il numero si blocca per 15 minuti.")).toBeVisible();
  for (const [left, code] of [
    [3, "111111"],
    [2, "121212"],
  ] as const) {
    await typeCode(page, code);
    await expect(page.getByText(`Codice non corretto. Ti restano ${left} tentativi.`)).toBeVisible();
  }
  await typeCode(page, "222222");
  await expect(page.getByText("Codice non corretto. Ti resta 1 tentativo.")).toBeVisible();
  await typeCode(page, "333333");
  await expect(page.getByText("Troppi codici sbagliati: il numero è bloccato per 15 minuti.")).toBeVisible();
  await expect(page.getByText(/Codice assistenza ERR-[0-9A-Z]{5}/)).toBeVisible();
  await expect(page.getByLabel("Codice di verifica di 6 cifre")).toBeDisabled();
});

test("errori del form: riepilogo in alto e messaggi del design", async ({ page }) => {
  await page.goto("/salone-demo");
  await page.getByLabel("Telefono").fill("347 12");
  await page.getByRole("button", { name: "Crea la mia carta" }).click();
  await expect(page.getByText("Controlla i 3 campi evidenziati.")).toBeVisible();
  await expect(page.getByText("Numero incompleto: servono 9 o 10 cifre.")).toBeVisible();
  await expect(page.getByText("Senza consenso non possiamo creare la carta.")).toBeVisible();
  await expect(page.getByRole("alert").first()).toBeFocused();
});

test("negozio sospeso e negozio inesistente", async ({ page }) => {
  await page.goto("/negozio-sospeso");
  await expect(page.getByRole("heading", { name: "Carta momentaneamente non disponibile" })).toBeVisible();

  await page.goto("/salone-norra");
  await expect(page.getByRole("heading", { name: "Qui non c'è nessuna carta" })).toBeVisible();
  await expect(page.getByText("localhost:3100/salone-norra")).toBeVisible();
});

test.describe("da iPhone", () => {
  test.use({ userAgent: UA.iphone });
  test("QR e codice breve da mostrare in cassa finché non c'è Apple Wallet", async ({ page }) => {
    await fillAndSubmit(page, "salone-demo", newPhone());
    await typeCode(page, "123456");
    await expect(page.getByRole("img", { name: "QR della tua carta da mostrare in cassa" })).toBeVisible();
    await expect(page.getByText("La carta per Apple Wallet arriva a breve", { exact: false })).toBeVisible();
    await expect(page.locator(".lw-code")).toHaveText(/^[2-9A-HJKMNP-Z]{8}$/);
  });
});

test("disiscrizione: conferma, poi link già usato, link manomesso", async ({ page }) => {
  const { data } = await admin.rpc("enroll_customer", {
    p_shop_id: "11111111-1111-4111-8111-111111111111",
    p_name: `${NAME} Promo`,
    p_phone: `+39${newPhone()}`,
    p_consent_privacy: true,
    p_consent_marketing: true,
    p_meta: { actor_type: "customer" },
  });
  const token = unsubscribeToken((data as { customer_id: string }).customer_id, "7d1e2b3c-4d5e-4f43-9a51-5f1c2a9e0d1b");

  await page.goto(`/u/${token}`);
  await expect(page.getByRole("heading", { name: "Niente più promozioni?" })).toBeVisible();
  await page.getByRole("button", { name: "Non voglio più promozioni" }).click();
  await expect(page.getByRole("status")).toContainText("non riceverai più promozioni da Salone Demo");

  await page.goto(`/u/${token}`);
  await expect(page.getByRole("heading", { name: "Sei già disiscritto" })).toBeVisible();
  await page.goto(`/u/${token.split(".")[0]}.manomesso`);
  await expect(page.getByRole("heading", { name: "Link non valido" })).toBeVisible();
});

test("informativa e cartello A5 raggiungibili dal negozio", async ({ page }) => {
  await page.goto("/salone-demo/privacy");
  await expect(page.getByRole("heading", { name: /Informativa privacy/ })).toBeVisible();
  await expect(page.getByText("Salone Demo di Mario Rossi", { exact: false })).toBeVisible();
  await page.goto("/salone-demo/qr");
  await expect(page.getByRole("link", { name: "Scarica PDF" })).toBeVisible();
  const pdf = await page.request.get("/salone-demo/qr.pdf");
  expect(pdf.headers()["content-type"]).toBe("application/pdf");
});
