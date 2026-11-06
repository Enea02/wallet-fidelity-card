import { expect, test } from "@playwright/test";

/*
 * Server unico: sito pubblico, pannello interno, API e web app esercente (/app) dallo stesso
 * processo Next. Le schermate dell'app ricevono index.html, i file mancanti restano 404 e le
 * pagine del sito non vengono mai sostituite dall'app.
 */

test("sito, pannello e web app esercente convivono sullo stesso server", async ({ request }) => {
  const app = await request.get("/app/clienti/123");
  expect(app.status()).toBe(200);
  expect(await app.text()).toContain('src="/app/_expo/');
  expect(app.headers()["x-robots-tag"]).toContain("noindex");
  expect(app.headers()["cache-control"]).toBe("no-cache");

  // un file dell'app che non esiste è un 404, non la pagina dell'app (niente HTML al posto di un JS)
  expect((await request.get("/app/_expo/static/js/web/non-esiste.js")).status()).toBe(404);

  // le pagine del sito restano del sito
  const shop = await request.get("/salone-demo");
  expect(shop.status()).toBe(200);
  expect(await shop.text()).not.toContain('src="/app/_expo/');
  const panel = await request.get("/interno/accesso");
  expect(panel.status()).toBe(200);
  expect(await panel.text()).not.toContain('src="/app/_expo/');
});

test("service worker e manifest restano dentro /app", async ({ request }) => {
  const sw = await request.get("/app/sw.js");
  expect(sw.status()).toBe(200);
  expect(sw.headers()["service-worker-allowed"]).toBe("/app");
  expect(sw.headers()["cache-control"]).toBe("no-cache");

  const manifest = (await (await request.get("/app/manifest.webmanifest")).json()) as {
    scope: string;
    start_url: string;
    icons: Array<{ src: string }>;
  };
  expect(manifest.scope).toBe("/app");
  expect(manifest.start_url).toBe("/app");
  expect(manifest.icons.every((i) => i.src.startsWith("/app/icons/"))).toBe(true);
});

test("i file con l'hash nel nome hanno la cache lunga", async ({ request }) => {
  const html = await (await request.get("/app")).text();
  const bundle = html.match(/src="(\/app\/_expo\/[^"]+)"/)?.[1];
  expect(bundle).toBeTruthy();
  const res = await request.get(bundle!);
  expect(res.status()).toBe(200);
  expect(res.headers()["cache-control"]).toContain("immutable");
});
