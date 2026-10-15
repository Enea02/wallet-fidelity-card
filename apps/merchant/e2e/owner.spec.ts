import { expect, test } from "@playwright/test";
import {
  deleteAuthUser,
  emailLink,
  expectLogLine,
  login,
  newCustomer,
  OPERATOR,
  OWNER,
  restDelete,
  restPatch,
  restSelect,
  SALONE,
  TINY_PNG,
} from "./helpers";

/*
 * Area titolare sulla web app (Fase 8, desktop): panoramica, clienti (ricerca, rettifica,
 * revoca del consenso, cancellazione), impostazioni carta e logo, staff, messaggi, cartello.
 * E un operatore non raggiunge nessuna di queste schermate, nemmeno scrivendo l'indirizzo.
 */

const OWNER_PATHS = ["/panoramica", "/clienti", "/carta", "/staff", "/messaggi", "/cartello"];

test("operatore: nessuna schermata del titolare, nemmeno dall'indirizzo", async ({ page }) => {
  const c = await newCustomer(SALONE, "Zeno Nascosto");
  await login(page, OPERATOR);
  await page.getByTestId("negozio-salone-demo").click();
  await expect(page).toHaveURL(/\/scanner$/);
  for (const k of ["panoramica", "clienti", "carta", "staff", "messaggi", "cartello"]) {
    await expect(page.getByTestId(`nav-${k}`)).toHaveCount(0);
  }
  // anche ricaricando direttamente un indirizzo del titolare si finisce sullo scanner
  for (const path of [...OWNER_PATHS, `/clienti/${c.id}`]) {
    await page.goto(path);
    await expect(page, `${path} non deve aprirsi per l'operatore`).toHaveURL(/\/scanner$/);
  }
  await expect(page.getByText("Zeno Nascosto")).toHaveCount(0);
});

test.describe("titolare", () => {
  let original: { hex_color: string; logo_url: string | null; logo_path: string | null; reward_label: string } | null =
    null;
  test.beforeAll(async () => {
    const rows = await restSelect<Array<NonNullable<typeof original>>>(
      `shops?id=eq.${SALONE}&select=hex_color,logo_url,logo_path,reward_label`,
    );
    original = rows[0] ?? null;
  });
  test.afterAll(async () => {
    if (original) await restPatch(`shops?id=eq.${SALONE}`, original);
    await restDelete(`promotions?shop_id=eq.${SALONE}`);
  });

  test.beforeEach(async ({ page }) => {
    await login(page, OWNER);
    await expect(page).toHaveURL(/\/panoramica$/);
  });

  test("panoramica: numeri della settimana, 8 settimane, inattivi", async ({ page }) => {
    for (const k of ["iscritti", "timbri", "premi", "inattivi"])
      await expect(page.getByTestId(`kpi-${k}`)).toBeVisible();
    await expect(page.getByTestId("dettaglio-settimana")).toContainText(/^Settimana .*: \d+ timbr/);
    await expectLogLine((l) => l.event === "stats.viewed");
  });

  test("clienti: ricerca, correzione del saldo con motivo, revoca del consenso", async ({ page }) => {
    const c = await newCustomer(SALONE, `Zoe Rettifica ${Date.now() % 10000}`, true);
    await page.getByTestId("nav-clienti").click();
    await page.getByTestId("cerca-clienti").fill(c.shortCode);
    await page.getByTestId(`cliente-${c.shortCode}`).click();
    await expect(page.getByTestId("dettaglio-nome")).toContainText("Zoe Rettifica");
    await expect(page).toHaveURL(new RegExp(`/clienti\\?id=${c.id}`));

    await page.getByTestId("correggi-saldo").click();
    await page.getByTestId("rettifica-timbri-piu").click();
    await page.getByTestId("rettifica-timbri-piu").click();
    await expect(page.getByTestId("rettifica-riepilogo")).toHaveText("+2 timbri");
    await page.getByTestId("motivo-Carta di carta vecchia").click();
    await page.getByTestId("salva-rettifica").click();
    await expect(page.getByTestId("dettaglio-saldo")).toContainText("2/10");
    await expect(page.getByText("Correzione · Carta di carta vecchia")).toBeVisible();
    const [row] = await restSelect<Array<{ stamps: number }>>(`customers?id=eq.${c.id}&select=stamps`);
    expect(row?.stamps).toBe(2);
    await expectLogLine((l) => l.event === "balance.adjust.ok" && l.customer_ref === c.shortCode);

    await page.getByTestId("revoca-consenso").click();
    await page.getByTestId("conferma-revoca").click();
    await expect(page.getByTestId("dettaglio-consenso")).toHaveText("Non riceve promozioni.");
    await expect(page.getByTestId("revoca-consenso")).toHaveCount(0);
  });

  test("cancellazione: doppia conferma, dati rimossi, audit pseudonimizzato", async ({ page }) => {
    const c = await newCustomer(SALONE, `Zara Cancellata ${Date.now() % 10000}`);
    await page.getByTestId("nav-clienti").click();
    await page.getByTestId("cerca-clienti").fill(c.shortCode);
    await page.getByTestId(`cliente-${c.shortCode}`).click();
    await page.getByTestId("cancella-cliente").click();
    await page.getByTestId("cancella-continua").click();
    await page.getByTestId("cancella-codice").fill("XXXXXXXX");
    await expect(page.getByTestId("cancella-conferma")).toBeDisabled();
    await page.getByTestId("cancella-codice").fill(c.shortCode);
    await page.getByTestId("cancella-conferma").click();
    await expect(page.getByTestId(`cliente-${c.shortCode}`)).toHaveCount(0);

    const [row] = await restSelect<Array<{ name: string; phone: string | null; deleted_at: string | null }>>(
      `customers?id=eq.${c.id}&select=name,phone,deleted_at`,
    );
    expect(row).toMatchObject({ phone: null });
    expect(row?.deleted_at).not.toBeNull();
    expect(row?.name).not.toContain("Zara");
    const audit = await restSelect<Array<{ before: unknown; after: unknown }>>(
      `audit_log?entity_id=eq.${c.id}&select=before,after`,
    );
    expect(JSON.stringify(audit)).not.toContain("Zara");
    await expectLogLine((l) => l.event === "customer.delete.ok" && l.customer_ref === c.shortCode);
  });

  test("carta: colore e logo con anteprima, salvataggio che aggiorna le carte", async ({ page }) => {
    await page.getByTestId("nav-carta").click();
    await page.getByTestId("colore-#2F4B7C").click();
    await expect(page.getByTestId("colore-hex")).toHaveValue("#2F4B7C");
    await page.getByTestId("testo-premio").fill("Piega gratis");
    await expect(page.getByTestId("anteprima-modulo")).toContainText(/Ti mancano/);

    const chooser = page.waitForEvent("filechooser");
    await page.getByTestId("carica-logo").click();
    await (await chooser).setFiles({ name: "logo.png", mimeType: "image/png", buffer: TINY_PNG });
    await expect(page.getByText("Nuovo logo pronto")).toBeVisible();

    await page.getByTestId("salva-carta").click();
    await expect(page.getByText("Le carte nei wallet si aggiornano entro qualche minuto.")).toBeVisible();
    const save = await expectLogLine((l) => l.event === "settings.update.ok" && String(l.changes).includes("colore"));
    expect(String(save.msg)).toContain("premio Taglio gratis → Piega gratis");
    await expectLogLine((l) => l.event === "logo.upload.ok");
    const [shop] = await restSelect<Array<{ hex_color: string; logo_url: string | null }>>(
      `shops?id=eq.${SALONE}&select=hex_color,logo_url`,
    );
    expect(shop?.hex_color).toBe("#2f4b7c");
    expect(shop?.logo_url).toContain("/storage/v1/object/public/logos/");
  });

  test("staff: invito, invito in attesa, reinvio, cambio di ruolo, rimozione", async ({ page }) => {
    const email = `staff-${Date.now()}@esempio.test`;
    await page.getByTestId("nav-staff").click();
    await page.getByTestId("invito-email").fill(email);
    await page.getByTestId("invito-nome").fill("Ugo Prova");
    await page.getByTestId("invita").click();
    await expect(page.getByText("Invito inviato a Ugo Prova")).toBeVisible();
    await expect(page.getByTestId("membro-Ugo Prova")).toContainText("in attesa");
    await emailLink(email, /invito/i);

    await page.getByTestId("reinvia-Ugo Prova").click();
    await expect(page.getByText("Invito inviato di nuovo a Ugo Prova.")).toBeVisible();
    await expectLogLine((l) => l.event === "staff.invite.resent");

    await page.getByTestId("ruolo-Ugo Prova").click();
    await expect(page.getByText("Ugo Prova ora è titolare.")).toBeVisible();
    await page.getByTestId("rimuovi-Ugo Prova").click();
    await page.getByTestId("conferma-rimozione").click();
    await expect(page.getByTestId("membro-Ugo Prova")).toHaveCount(0);

    const [u] = await restSelect<Array<{ user_id: string }>>(`staff?display_name=eq.Ugo%20Prova&select=user_id`).catch(
      () => [],
    );
    if (u) await deleteAuthUser(u.user_id);
  });

  test("messaggi: destinatari, anteprima, invio e limite settimanale", async ({ page }) => {
    await restDelete(`promotions?shop_id=eq.${SALONE}`);
    await newCustomer(SALONE, "Zelia Promozioni", true);
    await page.getByTestId("nav-messaggi").click();
    const text = "Ottobre: piega + trattamento a 35 €. Prenota al 051 123456.";
    await page.getByTestId("testo-promo").fill(text);
    await expect(page.getByTestId("anteprima-notifica")).toHaveText(text);
    const recipients = Number(await page.getByTestId("destinatari").textContent());
    expect(recipients).toBeGreaterThan(0);

    await page.getByTestId("invia-promo").click();
    await page.getByTestId("conferma-promo").click();
    await expect(page.getByText(/Messaggio in coda per/)).toBeVisible();
    await expect(page.getByTestId("promo-storico").first()).toContainText(text);
    await expectLogLine((l) => l.event === "promo.send.queued");

    await page.getByTestId("testo-promo").fill("Un altro messaggio");
    await expect(page.getByText("Hai già inviato il messaggio di questa settimana")).toBeVisible();
    await expect(page.getByTestId("invia-promo")).toBeDisabled();
  });

  test("pagina ricaricata o segnalibro: si riapre la stessa sezione", async ({ page }) => {
    await page.getByTestId("nav-staff").click();
    await expect(page).toHaveURL(/\/staff$/);
    await page.reload();
    await expect(page).toHaveURL(/\/staff$/);
    await expect(page.getByTestId("invita")).toBeVisible();
  });

  test("cartello: anteprima e PDF scaricato", async ({ page }) => {
    await page.getByTestId("apri-cartello").click();
    await expect(page.getByTestId("anteprima-cartello")).toBeVisible();
    const download = page.waitForEvent("download");
    await page.getByTestId("scarica-cartello").click();
    const d = await download;
    expect(d.suggestedFilename()).toBe("cartello-salone-demo.pdf");
    const stream = await d.createReadStream();
    const head = await new Promise<string>((resolve) =>
      stream.once("data", (b: Buffer) => resolve(b.subarray(0, 5).toString())),
    );
    expect(head).toBe("%PDF-");
    await expectLogLine((l) => l.event === "counter_qr.downloaded");
  });
});
