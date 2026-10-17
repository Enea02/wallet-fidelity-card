import { expect, test } from "@playwright/test";
import { expectLogLine, login, OWNER, readerScan, restDelete, restSelect, rpcCall, SALONE } from "./helpers";

/*
 * Tessere prepagate (Fase 9.5) sulla web app, desktop: il titolare crea il tipo di tessera;
 * in cassa l'operatore legge una tessera da attivare, la attiva dopo il pagamento, scala, annulla
 * lo scalo e la ricarica. Tutto finisce nel database e nei log.
 */

const GIULIA = "22222222-2222-4222-8222-222222222222";

test("titolare: crea una tessera dalla sezione Tessere", async ({ page }) => {
  const name = `Tessera e2e ${Date.now() % 100000}`;
  await login(page, OWNER);
  await expect(page).toHaveURL(/\/panoramica$/);
  await page.getByTestId("nav-tessere").click();
  await page.getByTestId("nuova-tessera").click();
  await page.getByTestId("tessera-nome-campo").fill(name);
  await page.getByTestId("tessera-unita").fill("150");
  await page.getByTestId("tessera-singolare").fill("pagina");
  await page.getByTestId("tessera-plurale").fill("pagine");
  await page.getByTestId("scadenza-12").click();
  await page.getByTestId("salva-tessera").click();
  await expect(page.getByText(`Tessera «${name}» creata`)).toBeVisible();
  await expectLogLine((l) => l.event === "prepaid.product.created" && String(l.msg).includes(name));
  const [p] = await restSelect<Array<{ id: string; units: number; validity_months: number }>>(
    `prepaid_products?shop_id=eq.${SALONE}&name=eq.${encodeURIComponent(name)}&select=id,units,validity_months`,
  );
  expect(p).toMatchObject({ units: 150, validity_months: 12 });
  await restDelete(`prepaid_products?id=eq.${p!.id}`);
});

test("in cassa: attiva dopo il pagamento, scala 12, annulla, ricarica", async ({ page }) => {
  const product = await rpcCall<{ id: string }>("prepaid_product_save", {
    p_shop_id: SALONE,
    p_product_id: null,
    p_fields: {
      code: `e2e-${Date.now() % 100000}`,
      name: "Tessera fotocopie",
      units: 150,
      unit_singular: "pagina",
      unit_plural: "pagine",
    },
    p_meta: { actor_type: "staff", actor_id: GIULIA },
  });
  const card = await rpcCall<{ card_id: string; qr_token: string; customer_id: string }>("prepaid_enroll", {
    p_product_id: product.id,
    p_name: "Tina Tessera",
    p_phone: `+39347${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`,
    p_consent_privacy: true,
    p_consent_marketing: false,
    p_meta: {},
  });
  try {
    await login(page, "operatore@salone-demo.test");
    await page.getByTestId("negozio-salone-demo").click();
    await expect(page).toHaveURL(/\/scanner$/);
    await page.getByTestId("modalita-lettore").click();
    await readerScan(page, card.qr_token);

    await expect(page).toHaveURL(/\/tessera\//);
    await expect(page.getByTestId("tessera-stato")).toHaveText("Da attivare");
    await page.getByTestId("tessera-attiva").click();
    await page.getByTestId("conferma-pagamento").click();
    await expect(page.getByTestId("tessera-saldo")).toHaveText("150 / 150");

    for (let i = 0; i < 11; i++) await page.getByRole("button", { name: "Aumenta pagine" }).click();
    await page.getByTestId("tessera-scala").click();
    await expect(page.getByTestId("tessera-saldo")).toHaveText("138 / 150");
    const [after] = await restSelect<Array<{ balance: number }>>(`prepaid_cards?id=eq.${card.card_id}&select=balance`);
    expect(after?.balance).toBe(138);
    await expectLogLine((l) => l.event === "prepaid.consume.ok" && String(l.msg).includes("150 → 138"));

    await page.getByTestId("tessera-annulla").click();
    await expect(page.getByTestId("tessera-saldo")).toHaveText("150 / 150");

    await page.getByTestId("tessera-ricarica").click();
    await page.getByTestId("conferma-pagamento").click();
    await expect(page.getByTestId("tessera-saldo")).toHaveText("300 / 300");
    await expectLogLine((l) => l.event === "prepaid.recharge.ok");
  } finally {
    await restDelete(`customers?id=eq.${card.customer_id}`);
    await restDelete(`prepaid_products?id=eq.${product.id}`);
  }
});

test("abbonamento: creato dalla sezione Tessere, attivato e rinnovato in cassa", async ({ page }) => {
  const name = `Socio e2e ${Date.now() % 100000}`;
  await login(page, OWNER);
  await page.getByTestId("nav-tessere").click();
  await page.getByTestId("nuova-tessera").click();
  await page.getByTestId("tipo-abbonamento").click();
  await expect(page.getByTestId("tessera-unita")).toHaveCount(0);
  await page.getByTestId("tessera-nome-campo").fill(name);
  await page.getByTestId("tessera-vantaggio").fill("accesso illimitato");
  await page.getByTestId("scadenza-12").click();
  await page.getByTestId("salva-tessera").click();
  await expect(page.getByText(`Abbonamento «${name}» creato`)).toBeVisible();
  const [p] = await restSelect<Array<{ id: string; kind: string; units: number | null }>>(
    `prepaid_products?shop_id=eq.${SALONE}&name=eq.${encodeURIComponent(name)}&select=id,kind,units`,
  );
  expect(p).toMatchObject({ kind: "abbonamento", units: null });
  const card = await rpcCall<{ card_id: string; qr_token: string; customer_id: string }>("prepaid_enroll", {
    p_product_id: p!.id,
    p_name: "Sofia Socia",
    p_phone: `+39347${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`,
    p_consent_privacy: true,
    p_consent_marketing: false,
    p_meta: {},
  });
  try {
    await page.getByTestId("nav-scanner").click();
    await page.getByTestId("modalita-lettore").click();
    await readerScan(page, card.qr_token);
    await expect(page).toHaveURL(/\/tessera\//);
    await expect(page.getByTestId("tessera-stato")).toHaveText("Da attivare");
    await page.getByTestId("tessera-attiva").click();
    await page.getByTestId("conferma-pagamento").click();
    await expect(page.getByTestId("tessera-stato")).toHaveText("Valido");
    await expect(page.getByTestId("tessera-saldo")).toHaveText("accesso illimitato");
    await expect(page.getByTestId("tessera-scala")).toHaveCount(0);
    await expectLogLine((l) => l.event === "membership.activate.ok" && String(l.msg).includes(name));

    await page.getByTestId("tessera-ricarica").click();
    await page.getByTestId("conferma-pagamento").click();
    await expect(page.getByText("Abbonamento rinnovato")).toBeVisible();
    await expectLogLine((l) => l.event === "membership.renew.ok" && String(l.msg).includes(name));
  } finally {
    await restDelete(`customers?id=eq.${card.customer_id}`);
    await restDelete(`prepaid_products?id=eq.${p!.id}`);
  }
});
