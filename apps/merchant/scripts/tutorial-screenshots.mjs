#!/usr/bin/env node
/*
 * Screenshot del tutorial (docs/tutorial/): percorre l'app vera in locale e salva le immagini in
 * docs/tutorial/img/. Serve tutto avviato: Supabase locale, web su :3000 e app esercente su :8081
 * (`pnpm dev:merchant`). Prepara da sé alcuni clienti e tessere di esempio con le funzioni Postgres
 * (service role, solo in locale) e li rimuove al giro successivo.
 *
 *   node apps/merchant/scripts/tutorial-screenshots.mjs [filtro]
 *
 * Il filtro facoltativo (es. "cliente", "cassa", "titolare", "punti", "tessere", "interno") esegue
 * solo le sezioni il cui nome lo contiene.
 */
/* global document, NodeFilter -- codice eseguito nelle pagine con page.evaluate */
import { execFileSync } from "node:child_process";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, devices } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import QRCode from "qrcode";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const OUT = join(root, "docs/tutorial/img");
const SCRATCH = join(root, "apps/merchant/e2e-logs");
mkdirSync(OUT, { recursive: true });
mkdirSync(SCRATCH, { recursive: true });
const { generate } = createRequire(join(root, "apps/web/package.json"))("otplib");

const WEB = "http://localhost:3000";
const APP = "http://localhost:8081";
const PASSWORD = "password-demo-locale";
const GIULIA = { email: "staff@salone-demo.test", id: "22222222-2222-4222-8222-222222222222" };
const MARCO = { email: "operatore@salone-demo.test", id: "55555555-5555-4555-8555-555555555555" };
const PAOLA = { email: "titolare@bar-punti.test", id: "99999999-9999-4999-8999-999999999999" };
const SALONE = "11111111-1111-4111-8111-111111111111";
const BARBIERE = "44444444-4444-4444-8444-444444444444";
const BAR = "88888888-8888-4888-8888-888888888888";

const status = JSON.parse(
  execFileSync("supabase", ["status", "-o", "json"], { cwd: root, stdio: ["ignore", "pipe", "ignore"] }).toString(),
);
const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const webEnv = Object.fromEntries(
  readFileSync(join(root, "apps/web/.env.local"), "utf8")
    .split("\n")
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);

/* ---------------- dati di esempio ---------------- */

const DEMO = {
  salone: [
    { name: "Laura Bianchi", stamps: 7, marketing: true },
    { name: "Chiara Esposito", stamps: 9, marketing: true },
    { name: "Davide Russo", stamps: 3, marketing: false },
    { name: "Sara Colombo", stamps: 10, marketing: true },
    { name: "Paolo Ricci", stamps: 0, marketing: false },
    { name: "Elena Marino", stamps: 5, marketing: true },
    { name: "Francesca Greco", stamps: 1, marketing: false },
  ],
  barbiere: [{ name: "Luca Moretti", stamps: 4, marketing: false }],
  bar: [
    { name: "Giorgio Conti", euro: [42, 61.5, 38, 90, 25] },
    { name: "Marta Gallo", euro: [85] },
  ],
};
const ALL_NAMES = [...DEMO.salone, ...DEMO.barbiere, ...DEMO.bar]
  .map((c) => c.name)
  .concat(["Anna Ferrara", "Irene Fontana", "Matteo Villa", "Alessia Rinaldi", "Nicola Serra"]);
const PRODUCTS = {
  carnet: {
    code: "carnet-pieghe",
    name: "Carnet 10 pieghe",
    units: 10,
    unit_singular: "piega",
    unit_plural: "pieghe",
    validity_months: 12,
  },
  socio: {
    code: "socio-benessere",
    name: "Abbonamento Benessere",
    kind: "abbonamento",
    benefit: "-20% su tutti i trattamenti",
    validity_months: 12,
  },
};
const phone = () => `+39347${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`;
const staffMeta = (u) => ({ actor_type: "staff", actor_id: u.id, platform: "script" });

async function rpc(fn, args) {
  const { data, error } = await admin.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data;
}

async function enroll(shopId, name, marketing = false) {
  const r = await rpc("enroll_customer", {
    p_shop_id: shopId,
    p_name: name,
    p_phone: phone(),
    p_consent_privacy: true,
    p_consent_marketing: marketing,
    p_meta: { actor_type: "customer" },
  });
  const { data } = await admin.from("customers").select("id, short_code, qr_token").eq("id", r.customer_id).single();
  return { id: data.id, shortCode: data.short_code, qr: data.qr_token, name };
}

async function stamp(customerId, staff, n) {
  for (let i = 0; i < n; i++)
    await rpc("add_stamp", { p_customer_id: customerId, p_meta: staffMeta(staff), p_force: true });
}

async function cleanup() {
  await admin.from("customers").delete().in("name", ALL_NAMES);
  await admin.from("customers").delete().like("name", "Tutorial %");
  const codes = Object.values(PRODUCTS).map((p) => p.code);
  const { data: products } = await admin.from("prepaid_products").select("id").in("code", codes);
  for (const p of products ?? []) {
    await admin.from("prepaid_cards").delete().eq("product_id", p.id);
    await admin.from("prepaid_products").delete().eq("id", p.id);
  }
  await admin.from("promotions").delete().eq("shop_id", SALONE);
}

async function prepare() {
  await cleanup();
  const c = {};
  for (const d of DEMO.salone) {
    c[d.name] = await enroll(SALONE, d.name, d.marketing);
    await stamp(c[d.name].id, GIULIA, d.stamps);
  }
  for (const d of DEMO.barbiere) {
    c[d.name] = await enroll(BARBIERE, d.name, d.marketing);
    await stamp(c[d.name].id, MARCO, d.stamps);
  }
  await admin
    .from("shops")
    .update({
      loyalty_mode: "punti",
      points_per_euro: 1,
      points_min_cents: 0,
      points_levels: [
        { name: "Silver", min: 0, perk: "" },
        { name: "Gold", min: 100, perk: "-5% su tutto" },
        { name: "Platinum", min: 300, perk: "-10% su tutto" },
      ],
    })
    .eq("id", BAR);
  for (const d of DEMO.bar) {
    c[d.name] = await enroll(BAR, d.name, false);
    for (const e of d.euro)
      await rpc("points_action", {
        p_action: "add",
        p_customer_id: c[d.name].id,
        p_amount_cents: Math.round(e * 100),
        p_meta: staffMeta(PAOLA),
      });
  }
  const carnet = await rpc("prepaid_product_save", {
    p_shop_id: SALONE,
    p_product_id: null,
    p_fields: PRODUCTS.carnet,
    p_meta: staffMeta(GIULIA),
  });
  const socio = await rpc("prepaid_product_save", {
    p_shop_id: SALONE,
    p_product_id: null,
    p_fields: PRODUCTS.socio,
    p_meta: staffMeta(GIULIA),
  });
  const card = await rpc("prepaid_enroll", {
    p_product_id: carnet.id,
    p_name: "Anna Ferrara",
    p_phone: phone(),
    p_consent_privacy: true,
    p_consent_marketing: false,
    p_meta: {},
  });
  const member = await rpc("prepaid_enroll", {
    p_product_id: socio.id,
    p_name: "Irene Fontana",
    p_phone: phone(),
    p_consent_privacy: true,
    p_consent_marketing: false,
    p_meta: {},
  });
  return { c, carnet, socio, card, member };
}

/* ---------------- strumenti ---------------- */

const phoneDevice = { ...devices["iPhone 13"], deviceScaleFactor: 2, locale: "it-IT" };
const androidDevice = { ...devices["Pixel 7"], deviceScaleFactor: 2, locale: "it-IT" };
const desktop = { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1.5, locale: "it-IT" };
const done = [];
const failed = [];

async function shot(page, name, opts = {}) {
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await page.evaluate(() => document.fonts?.ready).catch(() => undefined);
  await page.waitForTimeout(opts.wait ?? 400);
  // pulsanti degli strumenti di sviluppo (Next, Expo) che non fanno parte dell'app; email vere (non di
  // prova) rimaste nel DB locale: sfocate, mai pubblicate. Con un attributo, perché React riscrive lo stile.
  await page
    .evaluate(() => {
      if (!document.getElementById("tutorial-css")) {
        const css = document.createElement("style");
        css.id = "tutorial-css";
        css.textContent =
          "nextjs-portal,#error-toast{display:none!important}[data-tutorial-redact]{filter:blur(6px)!important}";
        document.head.append(css);
      }
      const real = (t) => (t.match(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g) ?? []).some((e) => !/\.(test|local)$/i.test(e));
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n = w.nextNode(); n; n = w.nextNode())
        if (n.parentElement && real(n.textContent ?? "")) n.parentElement.setAttribute("data-tutorial-redact", "");
      for (const i of document.querySelectorAll("input")) if (real(i.value)) i.setAttribute("data-tutorial-redact", "");
    })
    .catch(() => undefined);
  await page.waitForTimeout(50);
  const file = join(OUT, `${name}.png`);
  if (opts.locator) await opts.locator.screenshot({ path: file, animations: "disabled" });
  else await page.screenshot({ path: file, fullPage: opts.fullPage ?? false, animations: "disabled" });
  done.push(name);
  console.log(`  📸 ${name}`);
}

async function appLogin(page, user) {
  await page.goto(`${APP}/`);
  await page.getByTestId("campo-email").fill(user.email);
  await page.getByTestId("campo-password").fill(PASSWORD);
  return page.getByTestId("pulsante-accedi");
}

async function readerScan(page, code) {
  await page.getByTestId("campo-lettore").waitFor();
  await page.getByTestId("campo-lettore").focus();
  await page.keyboard.type(code, { delay: 5 });
  await page.keyboard.press("Enter");
}

const text = async (loc) => ((await loc.textContent()) ?? "").replace(/Copia(to)?$/, "").trim();

/* ---------------- sezioni ---------------- */

const sections = {
  async cliente(browser, data) {
    // le iscrizioni chiedono un codice SMS: con Twilio vero partirebbero SMS a numeri inventati
    if (webEnv.OTP_PROVIDER !== "test" && process.env.TUTORIAL_OTP_TEST !== "1") {
      throw new Error(
        'OTP_PROVIDER non è "test" in apps/web/.env.local: avviare il web con OTP_PROVIDER=test ' +
          "(es. `OTP_PROVIDER=test pnpm --filter @loyalty/web dev`) e rilanciare con TUTORIAL_OTP_TEST=1",
      );
    }
    // cartello A5 (desktop) e pagina di iscrizione dal telefono Android
    let ctx = await browser.newContext(desktop);
    let page = await ctx.newPage();
    await page.goto(`${WEB}/salone-demo/qr`);
    await shot(page, "cliente-01-cartello", { fullPage: true });
    await ctx.close();

    ctx = await browser.newContext(androidDevice);
    page = await ctx.newPage();
    await page.goto(`${WEB}/salone-demo`);
    await shot(page, "cliente-02-iscrizione");
    await page.getByRole("button", { name: "Crea la mia carta" }).click();
    await shot(page, "cliente-03-errori-form");
    await page.reload();
    await page.getByLabel("Nome").fill("Matteo Villa");
    await page.getByLabel("Telefono").fill("3470000001"); // numero fittizio, visibile negli screenshot
    await page.getByRole("checkbox", { name: /Accetto l'informativa privacy/ }).check();
    await page.getByRole("checkbox", { name: /Avvisami di offerte/ }).check();
    await shot(page, "cliente-04-form-compilato");
    await page.getByRole("button", { name: "Crea la mia carta" }).click();
    await page.getByRole("heading", { name: "Controlla gli SMS" }).waitFor({ timeout: 20_000 });
    await shot(page, "cliente-05-codice-sms");
    await page.getByLabel("Codice di verifica di 6 cifre").fill("123456");
    await page.getByRole("heading", { name: /la tua carta è pronta/ }).waitFor();
    await shot(page, "cliente-06-carta-pronta-android");
    await ctx.close();

    // iPhone: QR e codice breve da mostrare in cassa
    ctx = await browser.newContext(phoneDevice);
    page = await ctx.newPage();
    await page.goto(`${WEB}/salone-demo`);
    await page.getByLabel("Nome").fill("Alessia Rinaldi");
    await page.getByLabel("Telefono").fill(phone().slice(3));
    await page.getByRole("checkbox", { name: /Accetto l'informativa privacy/ }).check();
    await page.getByRole("button", { name: "Crea la mia carta" }).click();
    await page.getByLabel("Codice di verifica di 6 cifre").fill("123456");
    await page.getByRole("heading", { name: /la tua carta è pronta/ }).waitFor();
    await shot(page, "cliente-07-carta-pronta-iphone", { fullPage: true });
    await ctx.close();

    // da computer: QR per aprire la carta sul telefono
    ctx = await browser.newContext(desktop);
    page = await ctx.newPage();
    await page.goto(`${WEB}/salone-demo`);
    await page.getByLabel("Nome").fill("Nicola Serra");
    await page.getByLabel("Telefono").fill(phone().slice(3));
    await page.getByRole("checkbox", { name: /Accetto l'informativa privacy/ }).check();
    await page.getByRole("button", { name: "Crea la mia carta" }).click();
    await page.getByLabel("Codice di verifica di 6 cifre").fill("123456");
    await page.getByRole("img", { name: "QR per aprire la carta sul telefono" }).waitFor();
    await shot(page, "cliente-08-da-computer");
    await ctx.close();

    // cliente di ritorno: stesso numero, stessa carta
    ctx = await browser.newContext(androidDevice);
    page = await ctx.newPage();
    const back = phone().slice(3);
    for (let i = 0; i < 2; i++) {
      await page.goto(`${WEB}/salone-demo`);
      await page.getByLabel("Nome").fill("Tutorial Ritorno");
      await page.getByLabel("Telefono").fill(back);
      await page.getByRole("checkbox", { name: /Accetto l'informativa privacy/ }).check();
      await page.getByRole("button", { name: "Crea la mia carta" }).click();
      await page.getByLabel("Codice di verifica di 6 cifre").fill("123456");
      await page.getByRole("heading", { name: /Ciao Tutorial/ }).waitFor();
      if (i === 0) {
        const { data: r } = await admin.from("customers").select("id").eq("phone", `+39${back}`).single();
        await stamp(r.id, GIULIA, 6);
      }
    }
    await page.getByRole("heading", { name: /hai già una carta qui/ }).waitFor();
    await shot(page, "cliente-09-cliente-di-ritorno");

    // codice sbagliato
    await page.goto(`${WEB}/salone-demo`);
    await page.getByLabel("Nome").fill("Tutorial Errore");
    await page.getByLabel("Telefono").fill(phone().slice(3));
    await page.getByRole("checkbox", { name: /Accetto l'informativa privacy/ }).check();
    await page.getByRole("button", { name: "Crea la mia carta" }).click();
    await page.getByLabel("Codice di verifica di 6 cifre").fill("000000");
    await page.getByText(/Codice non corretto/).waitFor();
    await shot(page, "cliente-10-codice-errato");

    // negozio a punti e abbonamento
    await page.goto(`${WEB}/bar-punti-demo`);
    await shot(page, "cliente-11-iscrizione-punti");
    await page.getByLabel("Nome").fill("Tutorial Punti");
    await page.getByLabel("Telefono").fill(phone().slice(3));
    await page.getByRole("checkbox", { name: /Accetto l'informativa privacy/ }).check();
    await page.getByRole("button", { name: "Crea la mia carta" }).click();
    await page.getByLabel("Codice di verifica di 6 cifre").fill("123456");
    await page.getByTestId("punti-saldo").waitFor();
    await shot(page, "cliente-12-carta-punti-pronta");

    await page.goto(`${WEB}/salone-demo/t/${data.socio.code}`);
    await shot(page, "cliente-13-pagina-abbonamento");
    await page.goto(`${WEB}/salone-demo/t/${data.carnet.code}`);
    await shot(page, "cliente-14-pagina-carnet");

    // informativa e disiscrizione
    await page.goto(`${WEB}/salone-demo/privacy`);
    await shot(page, "cliente-15-informativa");
    const payload = Buffer.from(JSON.stringify({ c: data.c["Elena Marino"].id, p: randomUUID() })).toString(
      "base64url",
    );
    const sig = createHmac("sha256", webEnv.UNSUBSCRIBE_SECRET).update(payload).digest("base64url");
    await page.goto(`${WEB}/u/${payload}.${sig}`);
    await shot(page, "cliente-16-disiscrizione");
    await page.getByRole("button", { name: "Non voglio più promozioni" }).click();
    await page.getByRole("status").waitFor();
    await shot(page, "cliente-17-disiscrizione-fatta");

    await page.goto(`${WEB}/negozio-sospeso`);
    await shot(page, "cliente-18-negozio-sospeso");
    await ctx.close();
  },

  async accesso(browser) {
    const ctx = await browser.newContext(phoneDevice);
    const page = await ctx.newPage();
    await page.goto(`${APP}/`);
    await page.getByTestId("campo-email").waitFor();
    await shot(page, "app-01-accesso");
    await page.getByTestId("campo-email").fill(MARCO.email);
    await page.getByTestId("campo-password").fill("password-sbagliata");
    await page.getByTestId("pulsante-accedi").click();
    await page.getByText("Email o password non corrette.").waitFor();
    await shot(page, "app-02-credenziali-errate");
    await page.getByText("Password dimenticata?").click();
    await page.getByTestId("campo-email-recupero").waitFor();
    await page.getByTestId("campo-email-recupero").fill(MARCO.email);
    await shot(page, "app-03-password-dimenticata");
    await (await appLogin(page, MARCO)).click();
    await page.getByText("Dove lavori oggi?").waitFor();
    await shot(page, "app-04-scelta-negozio");
    await ctx.close();
  },

  async cassa(browser, data) {
    const c = data.c;
    const ctx = await browser.newContext(phoneDevice);
    const page = await ctx.newPage();
    await (await appLogin(page, MARCO)).click();
    await page.getByTestId("negozio-salone-demo").click();
    await page.waitForURL(/\/scanner$/);

    await page.getByTestId("modalita-lettore").click();
    await shot(page, "cassa-01-scanner-lettore");
    await page.getByTestId("modalita-manuale").click();
    await page.getByTestId("campo-codice-breve").fill(c["Paolo Ricci"].shortCode);
    await shot(page, "cassa-02-scanner-codice");
    await page.getByTestId("cerca-codice").click();
    await page.getByTestId("nome-cliente").waitFor();
    await shot(page, "cassa-03-scheda-cliente");
    await page.getByTestId("aggiungi-timbro").click();
    await page.getByTestId("toast").waitFor();
    await shot(page, "cassa-04-timbro-dato");
    await page.waitForTimeout(1300);
    await page.getByTestId("aggiungi-timbro").click();
    await page.getByTestId("foglio-cooldown").waitFor();
    await shot(page, "cassa-05-cooldown");
    await page
      .getByTestId("niente-timbro")
      .click()
      .catch(() => page.keyboard.press("Escape"));
    await page.getByTestId("annulla-timbro").click();
    await page.getByTestId("toast").filter({ hasText: "annullato" }).waitFor();
    await shot(page, "cassa-06-timbro-annullato");

    // carta quasi completa: ultimo timbro e premio
    await page.getByTestId("cliente-successivo").click();
    await page.waitForURL(/\/scanner$/);
    await page.getByTestId("modalita-lettore").click();
    await readerScan(page, c["Chiara Esposito"].qr);
    await page.getByTestId("nome-cliente").waitFor();
    await shot(page, "cassa-07-carta-quasi-completa");
    await page.getByTestId("aggiungi-timbro").click();
    await page
      .getByTestId("foglio-cooldown")
      .waitFor({ timeout: 3000 })
      .then(
        () => page.getByTestId("aggiungi-comunque").click(),
        () => undefined,
      );
    await page.getByTestId("premio-sbloccato").waitFor();
    await shot(page, "cassa-08-premio-sbloccato");
    await page.getByTestId("riscatta-ora").click();
    await page.getByTestId("foglio-riscatto").waitFor();
    await shot(page, "cassa-09-conferma-riscatto");
    await page.getByTestId("conferma-riscatto").click();
    await page.getByTestId("toast").filter({ hasText: "riscattato" }).waitFor();
    await shot(page, "cassa-10-premio-riscattato");

    // carta di un altro negozio
    await page.getByTestId("cliente-successivo").click();
    await page.waitForURL(/\/scanner$/);
    await page.getByTestId("modalita-lettore").click();
    await readerScan(page, c["Luca Moretti"].qr);
    await page.getByTestId("avviso-scanner").waitFor();
    await shot(page, "cassa-11-carta-altro-negozio");
    data.supportCode = await text(page.getByTestId("codice-assistenza")).catch(() => "");
    await page.getByTestId("chiudi-avviso").click();

    // senza rete
    await page.getByTestId("modalita-manuale").click();
    await page.getByTestId("campo-codice-breve").fill(c["Davide Russo"].shortCode);
    await page.getByTestId("cerca-codice").click();
    await page.getByTestId("nome-cliente").waitFor();
    await ctx.setOffline(true);
    await page
      .getByText(/Senza rete/)
      .first()
      .waitFor();
    await shot(page, "cassa-12-senza-rete");
    await ctx.setOffline(false);

    // profilo dell'operatore
    await page.getByTestId("tab-profilo").click();
    await page.getByTestId("profilo-ruolo").waitFor();
    await shot(page, "cassa-13-profilo-operatore");
    await page.getByTestId("invia-diagnostica").click();
    await page.getByText("Diagnostica inviata").waitFor();
    data.ticket = await text(page.getByTestId("codice-assistenza"));
    await shot(page, "cassa-14-diagnostica-inviata");
    await ctx.close();
  },

  async fotocamera(_browser, data) {
    // fotocamera vera di Chromium con un video finto che inquadra il QR di un cliente
    const qr = await QRCode.toDataURL(data.c["Laura Bianchi"].qr, { margin: 4, width: 360 });
    const tmp = await chromium.launch();
    const p = await tmp.newPage({ viewport: { width: 640, height: 480 } });
    await p.setContent(
      `<body style="margin:0;background:#6b6b6b;display:flex;align-items:center;justify-content:center;height:480px"><img src="${qr}" width="360" height="360"/></body>`,
    );
    const frame = await p.screenshot({ type: "jpeg", quality: 90 });
    await tmp.close();
    const video = join(SCRATCH, "qr-tutorial.mjpeg");
    writeFileSync(video, Buffer.concat(Array.from({ length: 30 }, () => frame)));
    const cam = await chromium.launch({
      args: [
        "--use-fake-ui-for-media-stream",
        "--use-fake-device-for-media-stream",
        `--use-file-for-fake-video-capture=${video}`,
      ],
    });
    const ctx = await cam.newContext({ ...phoneDevice, permissions: ["camera"] });
    const page = await ctx.newPage();
    await (await appLogin(page, MARCO)).click();
    await page.getByTestId("negozio-salone-demo").click();
    await page.waitForURL(/\/scanner$/);
    await page.getByTestId("modalita-fotocamera").click();
    await page
      .getByTestId("video-fotocamera")
      .waitFor()
      .catch(() => undefined);
    await shot(page, "cassa-00-scanner-fotocamera", { wait: 50 });
    await page.getByTestId("nome-cliente").waitFor({ timeout: 15_000 });
    await shot(page, "cassa-00b-fotocamera-letta");
    await ctx.close();
    await cam.close();
  },

  async titolare(browser, data) {
    const c = data.c;
    const ctx = await browser.newContext(desktop);
    const page = await ctx.newPage();
    await (await appLogin(page, GIULIA)).click();
    await page.waitForURL(/\/panoramica$/);
    await page.getByTestId("kpi-iscritti").waitFor();
    await shot(page, "titolare-01-panoramica");

    await page.getByTestId("nav-clienti").click();
    await page.getByTestId("cerca-clienti").waitFor();
    await shot(page, "titolare-02-clienti");
    await page.getByTestId("cerca-clienti").fill("Laura");
    await page.getByTestId(`cliente-${c["Laura Bianchi"].shortCode}`).click();
    await page.getByTestId("dettaglio-nome").waitFor();
    await shot(page, "titolare-03-dettaglio-cliente");
    await page.getByTestId("correggi-saldo").click();
    await page.getByTestId("foglio-rettifica").waitFor();
    await page.getByTestId("rettifica-timbri-piu").click();
    await page.getByTestId("motivo-Carta di carta vecchia").click();
    await shot(page, "titolare-04-correzione-saldo");
    await page.getByTestId("salva-rettifica").click();
    await page.getByText(/Correzione · Carta di carta vecchia/).waitFor();
    await shot(page, "titolare-05-correzione-salvata");
    await page.getByTestId("revoca-consenso").click();
    await page.getByTestId("foglio-revoca").waitFor();
    await shot(page, "titolare-06-revoca-consenso");
    await page.keyboard.press("Escape");
    await page.goto(`${APP}/clienti?id=${c["Francesca Greco"].id}`);
    await page.getByTestId("cancella-cliente").click();
    await page.getByTestId("cancella-continua").click();
    await page.getByTestId("cancella-codice").fill(c["Francesca Greco"].shortCode);
    await shot(page, "titolare-07-cancellazione");
    await page.keyboard.press("Escape");

    await page.getByTestId("nav-carta").click();
    await page.getByTestId("salva-carta").waitFor();
    await shot(page, "titolare-08-carta");

    await page.getByTestId("nav-staff").click();
    await page.getByTestId("invita").waitFor();
    await page.getByTestId("invito-email").fill("valentina@salone-demo.test");
    await page.getByTestId("invito-nome").fill("Valentina");
    await shot(page, "titolare-09-staff");

    await page.getByTestId("nav-messaggi").click();
    await page.getByTestId("testo-promo").waitFor();
    await page
      .getByTestId("testo-promo")
      .fill("Novembre: piega + trattamento ristrutturante a 35 €. Prenota al 051 123456.");
    await shot(page, "titolare-10-messaggi");
    await page.getByTestId("invia-promo").click();
    await page.getByTestId("foglio-promo").waitFor();
    await shot(page, "titolare-11-conferma-messaggio");
    await page.keyboard.press("Escape");

    await page.goto(`${APP}/cartello`);
    await page.getByTestId("anteprima-cartello").waitFor();
    await shot(page, "titolare-12-cartello");

    await page.getByTestId("nav-profilo").click();
    await page.getByTestId("profilo-ruolo").waitFor();
    await shot(page, "titolare-13-profilo");

    // la stessa app sul telefono del titolare
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${APP}/panoramica`);
    await page.getByTestId("kpi-iscritti").waitFor();
    await shot(page, "titolare-14-panoramica-telefono");
    await ctx.close();
  },

  async tessere(browser, data) {
    const ctx = await browser.newContext(desktop);
    const page = await ctx.newPage();
    await (await appLogin(page, GIULIA)).click();
    await page.waitForURL(/\/panoramica$/);
    await page.getByTestId("nav-tessere").click();
    await page.getByTestId("nuova-tessera").waitFor();
    await shot(page, "tessere-01-elenco");
    await page.getByTestId("nuova-tessera").click();
    await page.getByTestId("tessera-nome-campo").fill("Carnet 5 colori");
    await page.getByTestId("tessera-unita").fill("5");
    await page.getByTestId("tessera-singolare").fill("colore");
    await page.getByTestId("tessera-plurale").fill("colori");
    await page.getByTestId("scadenza-12").click();
    await shot(page, "tessere-02-nuova-tessera");
    await page.getByTestId("tipo-abbonamento").click();
    await page.getByTestId("tessera-nome-campo").fill("Abbonamento Piega Libera");
    await page.getByTestId("tessera-vantaggio").fill("piega libera tutti i sabati");
    await shot(page, "tessere-03-nuovo-abbonamento");
    await page.keyboard.press("Escape");

    // in cassa: carnet da attivare, attivato, scalato
    await page.getByTestId("nav-scanner").click();
    await page.getByTestId("modalita-lettore").click();
    await readerScan(page, data.card.qr_token);
    await page.getByTestId("tessera-stato").waitFor();
    await shot(page, "tessere-04-carnet-da-attivare");
    await page.getByTestId("tessera-attiva").click();
    await page.getByTestId("foglio-pagamento").waitFor();
    await shot(page, "tessere-05-conferma-pagamento");
    await page.getByTestId("conferma-pagamento").click();
    await page.getByTestId("tessera-saldo").filter({ hasText: "10 / 10" }).waitFor();
    await page.getByTestId("tessera-scala").click();
    await page.getByTestId("tessera-saldo").filter({ hasText: "9 / 10" }).waitFor();
    await shot(page, "tessere-06-carnet-scalato");

    await page.getByTestId("nav-scanner").click();
    await page.getByTestId("modalita-lettore").click();
    await readerScan(page, data.member.qr_token);
    await page.getByTestId("tessera-stato").waitFor();
    await page.getByTestId("tessera-attiva").click();
    await page.getByTestId("conferma-pagamento").click();
    await page.getByTestId("tessera-stato").filter({ hasText: "Valido" }).waitFor();
    await shot(page, "tessere-07-abbonamento-valido");
    await ctx.close();
  },

  async punti(browser, data) {
    const ctx = await browser.newContext(desktop);
    const page = await ctx.newPage();
    await (await appLogin(page, PAOLA)).click();
    await page.waitForURL(/\/panoramica$/);
    await page.getByTestId("nav-scanner").click();
    await page.getByTestId("modalita-lettore").click();
    await readerScan(page, data.c["Marta Gallo"].qr);
    await page.getByTestId("punti-saldo").waitFor();
    await shot(page, "punti-01-scheda");
    await page.getByTestId("punti-importo").fill("23,50");
    await page.getByTestId("punti-anteprima").waitFor();
    await shot(page, "punti-02-importo");
    await page.getByTestId("punti-dai").click();
    await page.getByText(/Nuovo livello: Gold/).waitFor();
    await shot(page, "punti-03-nuovo-livello");

    await page.getByTestId("nav-carta").click();
    await page.getByTestId("carta-punti").waitFor();
    await shot(page, "punti-04-impostazioni");
    await page.getByTestId("nav-clienti").click();
    await page.getByTestId("cerca-clienti").fill("Giorgio");
    await page.getByTestId(`cliente-${data.c["Giorgio Conti"].shortCode}`).click();
    await page.getByTestId("dettaglio-nome").waitFor();
    await shot(page, "punti-05-dettaglio-cliente");
    await ctx.close();
  },

  async interno(browser, data) {
    const email = `assistenza-tutorial-${Date.now()}@loyaltywallet.test`;
    const password = randomBytes(18).toString("base64url");
    const { data: u, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw error;
    try {
      await rpc("support_member_add", {
        p_user_id: u.user.id,
        p_display_name: "Assistenza Tutorial",
        p_email: email,
        p_meta: { actor_type: "support", actor_id: "tutorial", platform: "script" },
      });
      const sb = createClient(status.API_URL, status.ANON_KEY, { auth: { persistSession: false } });
      await sb.auth.signInWithPassword({ email, password });
      const enrolled = await sb.auth.mfa.enroll({ factorType: "totp", friendlyName: "tutorial" });
      const secret = enrolled.data.totp.secret;
      await sb.auth.mfa.challengeAndVerify({ factorId: enrolled.data.id, code: await generate({ secret }) });
      await new Promise((r) => setTimeout(r, 31_000 - (Date.now() % 30_000))); // codice TOTP nuovo

      const ctx = await browser.newContext(desktop);
      const page = await ctx.newPage();
      await page.goto(`${WEB}/interno/accesso`);
      await page.getByTestId("accesso-email").fill(email);
      await page.getByTestId("accesso-password").fill(password);
      await shot(page, "interno-01-accesso");
      await page.getByTestId("accesso-invia").click();
      await page.waitForURL(/\/interno\/accesso\/codice$/);
      await shot(page, "interno-02-codice");
      await page.getByTestId("codice-valore").fill(await generate({ secret }));
      await page.getByTestId("codice-invia").click();
      await page.waitForURL(/\/interno$/);
      await shot(page, "interno-03-assistenza");

      if (data.supportCode) {
        await page.getByTestId("cerca").fill(data.supportCode);
        await page.getByTestId("cerca-invia").click();
        await page.getByTestId("risultati").waitFor();
        await shot(page, "interno-04-ricerca-codice", { fullPage: true });
      }
      await page.goto(`${WEB}/interno?q=E_STAMP_COOLDOWN`);
      await page.getByTestId("risultati").waitFor();
      await shot(page, "interno-05-codice-errore");

      await page.goto(`${WEB}/interno?q=${data.c["Laura Bianchi"].shortCode}`);
      await page.waitForURL(/\/interno\/clienti\//).catch(() => undefined);
      await shot(page, "interno-06-cliente");
      await shot(page, "interno-06b-cliente-intera", { fullPage: true });

      await page.goto(`${WEB}/interno/negozi`);
      await shot(page, "interno-07-negozi");
      await page.goto(`${WEB}/interno/negozi/${SALONE}`);
      await page.getByTestId("negozio-titolo").waitFor();
      await shot(page, "interno-08-negozio");
      await page.goto(`${WEB}/interno/negozi/nuovo`);
      await shot(page, "interno-09-nuovo-negozio");
      await page.goto(`${WEB}/interno/diagnostica`);
      await shot(page, "interno-10-diagnostica");
      if (data.ticket) {
        await page.goto(`${WEB}/interno?q=${data.ticket}`);
        await page.waitForURL(/\/interno\/diagnostica\//).catch(() => undefined);
        await shot(page, "interno-11-pacchetto-diagnostica", { fullPage: true });
      }
      await ctx.close();
    } finally {
      await admin.auth.admin.deleteUser(u.user.id).catch(() => undefined);
    }
  },
};

/* ---------------- esecuzione ---------------- */

const filter = process.argv[2] ?? "";
console.log("▶ preparo i dati di esempio…");
const data = await prepare();
// in sviluppo Next compila ogni pagina alla prima visita: meglio prima, che durante gli screenshot
console.log("▶ preparo le pagine del web…");
for (const path of [
  "/salone-demo",
  "/salone-demo/qr",
  "/salone-demo/privacy",
  "/bar-punti-demo",
  "/negozio-sospeso",
  `/salone-demo/t/${data.carnet.code}`,
  "/interno/accesso",
  "/u/x.y",
])
  await fetch(`${WEB}${path}`).catch(() => undefined);
const browser = await chromium.launch();
// errori nella console delle pagine: finiscono in e2e-logs/tutorial-console.log
const consoleLog = [];
const newContext = browser.newContext.bind(browser);
browser.newContext = async (o) => {
  const ctx = await newContext(o);
  ctx.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning")
      consoleLog.push(`[${done.at(-1) ?? "inizio"}] ${m.type()}: ${m.text()}`);
  });
  return ctx;
};
for (const [name, run] of Object.entries(sections)) {
  if (filter && !name.includes(filter)) continue;
  console.log(`▶ ${name}`);
  try {
    await run(browser, data);
  } catch (e) {
    failed.push(name);
    console.error(
      `  ✖ ${name} (dopo ${done.at(-1) ?? "—"}): ${e instanceof Error ? e.message.split("\n").slice(0, 3).join(" ") : e}`,
    );
    // stato delle pagine rimaste aperte, per capire dove si è fermato
    let i = 0;
    for (const ctx of browser.contexts())
      for (const p of ctx.pages()) {
        await p.screenshot({ path: join(SCRATCH, `errore-${name}-${i++}.png`) }).catch(() => undefined);
        await ctx.close().catch(() => undefined);
      }
  }
}
await browser.close();
writeFileSync(join(SCRATCH, "tutorial-console.log"), consoleLog.join("\n"));
console.log(
  `\n✔ ${done.length} screenshot in docs/tutorial/img${failed.length ? ` · sezioni non riuscite: ${failed.join(", ")}` : ""}`,
);
process.exit(failed.length ? 1 : 0);
