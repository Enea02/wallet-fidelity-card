import { createHmac, randomInt } from "node:crypto";
import { execFileSync } from "node:child_process";
import { expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const status = JSON.parse(
  execFileSync("supabase", ["status", "-o", "json"], { stdio: ["ignore", "pipe", "ignore"] }).toString(),
) as Record<string, string>;
export const admin = createClient(status.API_URL ?? "", status.SERVICE_ROLE_KEY ?? "", {
  auth: { persistSession: false },
});

/** Nome usato in tutti i test: il controllo finale verifica che non compaia mai nei log del server. */
export const NAME = "Zefiro Prova";
/** Cellulari di prova: +39 3470 + 6 cifre casuali (il controllo finale cerca questo schema nei log). */
export const newPhone = () => `3470${String(randomInt(0, 999_999)).padStart(6, "0")}`;

export const UA = {
  iphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  desktop:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
};

/** Compila il form e arriva alla schermata del codice. */
export async function fillAndSubmit(page: Page, slug: string, phone: string, opts: { marketing?: boolean } = {}) {
  await page.goto(`/${slug}`);
  await page.getByLabel("Nome").fill(NAME);
  await page.getByLabel("Telefono").fill(phone);
  await page.getByRole("checkbox", { name: /Accetto l'informativa privacy/ }).check();
  if (opts.marketing) await page.getByRole("checkbox", { name: /Avvisami di offerte/ }).check();
  await page.getByRole("button", { name: "Crea la mia carta" }).click();
  await expect(page.getByRole("heading", { name: "Controlla gli SMS" })).toBeVisible({ timeout: 20_000 });
}

export async function typeCode(page: Page, code: string) {
  await page.getByLabel("Codice di verifica di 6 cifre").fill(code);
}

/** Link di disiscrizione firmato come fa il server (stesso segreto passato al server dei test). */
export function unsubscribeToken(customerId: string, promotionId: string) {
  const data = Buffer.from(JSON.stringify({ c: customerId, p: promotionId })).toString("base64url");
  const sig = createHmac("sha256", process.env.E2E_UNSUBSCRIBE_SECRET ?? "")
    .update(data)
    .digest("base64url");
  return `${data}.${sig}`;
}
