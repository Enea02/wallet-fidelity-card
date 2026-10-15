import { expect, test } from "@playwright/test";
import { login, OWNER } from "./helpers";

/*
 * Fotocamera del browser con un video finto (e2e/fake-camera.ts) che mostra il QR della carta
 * demo di salone-demo: BarcodeDetector del browser o, dove manca, il polyfill ZXing servito da noi.
 */
test("webcam: il QR inquadrato apre la scheda del cliente", async ({ page }) => {
  await login(page, OWNER);
  await page.getByTestId("nav-scanner").click(); // desktop: barra laterale
  await page.getByTestId("modalita-fotocamera").click();
  await expect(page.getByTestId("video-fotocamera")).toBeVisible();
  await expect(page.getByTestId("nome-cliente")).toHaveText("Cliente Demo", { timeout: 15_000 });
});
