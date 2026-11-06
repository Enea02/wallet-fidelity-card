// Service worker minimo della web app esercente: rende l'app installabile e la apre anche con
// rete instabile. In cache SOLO i file dell'app (HTML, JS, font, icone), MAI le risposte delle API:
// i dati dei clienti non restano sul dispositivo.
// L'app è servita sotto un prefisso (/app/) dallo stesso server del sito e del pannello interno:
// il SW lavora solo dentro il suo scope e non tocca le pagine del sito, del pannello o le API.
const CACHE = "esercente-v2";
const BASE = new URL(self.registration.scope).pathname; // es. "/app/"
const SHELL = BASE; // la pagina dell'app (index.html), servita per ogni percorso sotto BASE
// BASE contiene solo lettere, cifre, "-" e "/" (lo controlla scripts/apply-web-base.mjs): niente da escapare
const STATIC = new RegExp(`^${BASE}(_expo|assets|icons|zxing)/`);

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin || !url.pathname.startsWith(BASE)) return;

  // pagine: prima la rete (versione nuova dopo un deploy), la copia in cache solo se offline
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          // solo le pagine dell'app: un redirect (es. verso /accesso) non va in cache
          if (res.ok && !res.redirected) {
            const copy = res.clone();
            void caches.open(CACHE).then((c) => c.put(SHELL, copy));
          }
          return res;
        })
        .catch(() => caches.match(SHELL).then((r) => r ?? Response.error())),
    );
    return;
  }

  // file dell'app con hash nel nome (_expo/static, assets, icone, motore QR): cache, poi rete
  if (STATIC.test(url.pathname)) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ??
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              void caches.open(CACHE).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
  }
});
