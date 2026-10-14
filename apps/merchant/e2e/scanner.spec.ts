import { expect, test } from "@playwright/test";
import {
  BARBIERE,
  balance,
  expectLogLine,
  login,
  newCustomer,
  openScanner,
  OWNER,
  readerScan,
  SALONE,
  stampCount,
  stampsRequired,
} from "./helpers";

/*
 * Scanner e timbratura sulla web app (Fase 7): lettore QR esterno, codice a mano, doppio tocco,
 * premio sbloccato e riscatto, cooldown e "Aggiungi comunque", carta di un altro negozio, rete
 * assente e tempi (dalla lettura al timbro confermato sotto i 2 secondi).
 * barbiere-demo non ha cooldown; salone-demo ha 60 minuti.
 */

test("lettore esterno: lettura, timbro in meno di 2 secondi, cliente successivo senza clic", async ({ page }) => {
  const [a, b] = await Promise.all([newCustomer(BARBIERE, "Zefiro Primo"), newCustomer(BARBIERE, "Zefiro Secondo")]);
  await openScanner(page, "barbiere-demo", "lettore");

  const started = Date.now();
  await readerScan(page, a.qr);
  await expect(page.getByTestId("nome-cliente")).toHaveText("Zefiro Primo");
  await page.getByTestId("aggiungi-timbro").click();
  await expect(page.getByTestId("toast")).toContainText("Zefiro ha 1 timbro su");
  expect(Date.now() - started).toBeLessThan(2000);
  expect((await balance(a.id)).stamps).toBe(1);

  // la riga del client misura lettura → conferma; il backend ha la sua riga del timbro
  await expectLogLine((l) => l.event === "stamp.add.ok" && l.customer_ref === a.shortCode && l.platform === "web");

  await page.getByTestId("cliente-successivo").click();
  await expect(page).toHaveURL(/\/scanner$/);
  await readerScan(page, b.shortCode.toLowerCase()); // il campo è già a fuoco: nessun clic
  await expect(page.getByTestId("nome-cliente")).toHaveText("Zefiro Secondo");
});

test("doppio tocco rapido su +1 timbro: un solo timbro", async ({ page }) => {
  const c = await newCustomer(BARBIERE);
  await openScanner(page, "barbiere-demo", "manuale");
  await page.getByTestId("campo-codice-breve").fill(c.shortCode);
  await page.getByTestId("cerca-codice").click();
  await page.getByTestId("aggiungi-timbro").dblclick();
  await expect(page.getByTestId("toast")).toBeVisible();
  await page.waitForTimeout(500);
  expect(await stampCount(c.id)).toBe(1);
  expect((await balance(c.id)).stamps).toBe(1);
});

test("carta completata: premio sbloccato, riscatto con conferma, annullamento", async ({ page }) => {
  const c = await newCustomer(BARBIERE, "Zefiro Premio");
  const n = await stampsRequired(BARBIERE);
  await openScanner(page, "barbiere-demo", "lettore");
  await readerScan(page, c.qr);

  for (let i = 1; i < n; i++) {
    await page.getByTestId("aggiungi-timbro").click();
    await expect(page.getByTestId("griglia-timbri")).toHaveAttribute(
      "aria-label",
      `${i === 1 ? "1 timbro" : `${i} timbri`} su ${n}`,
    );
  }
  await page.getByTestId("aggiungi-timbro").click();
  await expect(page.getByTestId("premio-sbloccato")).toBeVisible();
  await expect(page.getByText("Premio sbloccato!")).toBeVisible();
  expect(await balance(c.id)).toEqual({ stamps: 0, rewards_available: 1 });

  await page.getByTestId("riscatta-ora").click();
  await expect(page.getByTestId("foglio-riscatto")).toBeVisible();
  await page.getByTestId("conferma-riscatto").click();
  await expect(page.getByTestId("toast")).toContainText("Premio riscattato");
  expect((await balance(c.id)).rewards_available).toBe(0);
  await expect(page.getByTestId("riscatta-premio")).toBeDisabled();

  // un nuovo timbro si può annullare entro 5 minuti
  await page.getByTestId("aggiungi-timbro").click();
  await expect(page.getByTestId("annulla-timbro")).toContainText("Annulla ultimo timbro · 5:00");
  await page.getByTestId("annulla-timbro").click();
  await expect(page.getByTestId("toast")).toContainText("Timbro annullato");
  expect((await balance(c.id)).stamps).toBe(0);
});

test('cooldown: minuti mancanti, poi "Aggiungi comunque" resta nel registro', async ({ page }) => {
  const c = await newCustomer(SALONE);
  await login(page, OWNER);
  await page.getByTestId("apri-scanner").click();
  await page.getByTestId("modalita-manuale").click();
  await page.getByTestId("campo-codice-breve").fill(c.shortCode);
  await page.getByTestId("cerca-codice").click();

  await page.getByTestId("aggiungi-timbro").click();
  await expect(page.getByTestId("toast")).toBeVisible();
  await page.getByTestId("aggiungi-timbro").click();
  await expect(page.getByTestId("foglio-cooldown")).toContainText("Timbro già dato da poco");
  await expect(page.getByTestId("foglio-cooldown")).toContainText(/tra 60 minuti/);
  expect((await balance(c.id)).stamps).toBe(1);

  await page.getByTestId("aggiungi-comunque").click();
  await expect(page.getByTestId("griglia-timbri")).toHaveAttribute("aria-label", "2 timbri su 10");
  const forced = await expectLogLine((l) => l.event === "stamp.add.forced" && l.customer_ref === c.shortCode);
  expect(forced.actor_role).toBe("owner");
});

test("carta di un altro negozio e codice che non è una carta: avviso chiaro, nessuna scheda", async ({ page }) => {
  const other = await newCustomer(SALONE);
  await openScanner(page, "barbiere-demo", "lettore");
  await readerScan(page, other.qr);
  await expect(page.getByTestId("avviso-scanner")).toContainText("Non è una carta di Barbiere Demo");
  await page.getByTestId("chiudi-avviso").click();

  await readerScan(page, "https://esempio.it/promo");
  await expect(page.getByTestId("avviso-scanner")).toContainText("Non è una carta");
  await expect(page).toHaveURL(/\/scanner$/);
});

test("rete assente sulla scheda: avviso e azioni bloccate", async ({ page, context }) => {
  const c = await newCustomer(BARBIERE);
  await openScanner(page, "barbiere-demo", "lettore");
  await readerScan(page, c.qr);
  await expect(page.getByTestId("aggiungi-timbro")).toBeEnabled();
  await context.setOffline(true);
  await expect(page.getByText(/Senza rete non si possono dare timbri/)).toBeVisible();
  await expect(page.getByTestId("aggiungi-timbro")).toBeDisabled();
  await context.setOffline(false);
  await expect(page.getByTestId("aggiungi-timbro")).toBeEnabled();
});
