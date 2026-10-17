import { expect, test } from "@playwright/test";
import { expectLogLine, login, newCustomer, readerScan, restDelete, restPatch, restSelect } from "./helpers";

/*
 * Carta a punti (Fase 9.6) sulla web app, desktop, nel negozio demo a punti: in cassa la titolare legge
 * la carta, scrive l'importo dello scontrino, vede l'anteprima, dà i punti, il cliente sale di livello,
 * annulla; nelle impostazioni cambia la regola dei punti. Tutto finisce nel database e nei log.
 */

const BAR = "88888888-8888-4888-8888-888888888888";
const PAOLA = "titolare@bar-punti.test";
const LEVELS = [
  { name: "Silver", min: 0, perk: "" },
  { name: "Gold", min: 100, perk: "-5% su tutto" },
  { name: "Platinum", min: 300, perk: "-10% su tutto" },
];

test.beforeEach(async () => {
  await restPatch(`shops?id=eq.${BAR}`, {
    loyalty_mode: "punti",
    points_per_euro: 1,
    points_min_cents: 0,
    points_levels: LEVELS,
  });
});

test("in cassa: importo, anteprima, punti, nuovo livello e annullamento", async ({ page }) => {
  const c = await newCustomer(BAR, "Pietro Punti");
  try {
    await login(page, PAOLA);
    await page.getByTestId("nav-scanner").click();
    await page.getByTestId("modalita-lettore").click();
    await readerScan(page, c.qr);

    await expect(page).toHaveURL(/\/punti\//);
    await expect(page.getByTestId("punti-saldo")).toHaveText("0 punti");
    await expect(page.getByTestId("punti-livello")).toHaveText("Silver · ancora 100 punti per Gold");

    await page.getByTestId("punti-importo").fill("85,90");
    await expect(page.getByTestId("punti-anteprima")).toHaveText("+85 punti");
    await page.getByTestId("punti-dai").click();
    await expect(page.getByTestId("punti-saldo")).toHaveText("85 punti");
    await expect(page.getByTestId("punti-importo")).toHaveValue("");

    await page.getByTestId("punti-importo").fill("20");
    await page.getByTestId("punti-dai").click();
    await expect(page.getByTestId("punti-saldo")).toHaveText("105 punti");
    await expect(page.getByText("Nuovo livello: Gold")).toBeVisible();
    await expect(page.getByTestId("punti-livello")).toHaveText("Gold · ancora 195 punti per Platinum");
    await expectLogLine((l) => l.event === "points.level.changed" && l.customer_ref === c.shortCode);

    await page.getByTestId("punti-annulla").click();
    await expect(page.getByTestId("punti-saldo")).toHaveText("85 punti");
    const [row] = await restSelect<Array<{ points: number; points_level: string }>>(
      `customers?id=eq.${c.id}&select=points,points_level`,
    );
    expect(row).toEqual({ points: 85, points_level: "Silver" });
    await expectLogLine((l) => l.event === "points.undo.ok" && l.customer_ref === c.shortCode);
  } finally {
    await restDelete(`customers?id=eq.${c.id}`);
  }
});

test("impostazioni: la titolare cambia i punti per euro", async ({ page }) => {
  try {
    await login(page, PAOLA);
    await page.getByTestId("nav-carta").click();
    await expect(page.getByTestId("carta-punti")).toBeVisible();
    // a punti spariscono i campi dei timbri
    await expect(page.getByTestId("timbri-necessari")).toHaveCount(0);
    await page.getByRole("button", { name: "Aumenta punti per euro" }).click();
    await page.getByTestId("livello-1-vantaggio").fill("-7% su tutto");
    await page.getByTestId("salva-punti").click();
    await expect(page.getByText("Salvato: le carte nei wallet si aggiornano")).toBeVisible();
    const [s] = await restSelect<Array<{ points_per_euro: number; points_levels: typeof LEVELS }>>(
      `shops?id=eq.${BAR}&select=points_per_euro,points_levels`,
    );
    expect(s!.points_per_euro).toBe(2);
    expect(s!.points_levels[1]!.perk).toBe("-7% su tutto");
    await expectLogLine((l) => l.event === "points.settings.updated" && String(l.msg).includes("punti per euro 1 → 2"));
  } finally {
    await restPatch(`shops?id=eq.${BAR}`, { points_per_euro: 1, points_levels: LEVELS });
  }
});
