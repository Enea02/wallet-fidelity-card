import { expect, test } from "@playwright/test";
import { login, OWNER } from "./helpers";

test("titolare su desktop: barra laterale con le sezioni del negozio, che resta aperta cambiando larghezza", async ({
  page,
}) => {
  await login(page, OWNER);
  await expect(page).toHaveURL(/\/panoramica$/);
  for (const k of ["panoramica", "clienti", "carta", "staff", "messaggi", "scanner", "profilo"]) {
    await expect(page.getByTestId(`nav-${k}`)).toBeVisible();
  }
  await page.getByTestId("nav-clienti").click();
  await expect(page).toHaveURL(/\/clienti$/);
  await expect(page.getByRole("heading", { name: "Clienti" })).toBeVisible();

  // da desktop a telefono: tab in basso, stessa sezione aperta
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByTestId("tab-clienti")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Clienti" })).toBeVisible();
  await expect(page).toHaveURL(/\/clienti$/);

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.getByTestId("nav-profilo").click();
  await expect(page.getByTestId("profilo-ruolo")).toHaveText("titolare");
});
