/*
 * Server statico senza dipendenze per l'anteprima e per il render.
 *   /                 → index.html
 *   /src, /music, /voce, /beats.md, /music.json → file di apps/motion
 *   /screens/<nome>   → docs/tutorial/img (schermate reali dell'app, nessuna copia)
 *   /vendor/gsap.min.js, /vendor/font/*   → da node_modules
 * Uso: `pnpm --filter @loyalty/motion dev` (porta 5180, oppure PORT=...).
 */
import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
export const APP_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SCREENS_DIR = resolve(process.env.SCREENS_DIR ?? join(APP_DIR, "../../docs/tutorial/img"));
const GSAP_FILE = require.resolve("gsap/dist/gsap.min.js");
const FONT_DIR = dirname(require.resolve("@fontsource-variable/bricolage-grotesque/index.css"));

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
};

/** Percorso dentro `base`, oppure null se la richiesta prova a uscirne. */
function inside(base, rel) {
  const p = normalize(join(base, decodeURIComponent(rel)));
  return p === base || p.startsWith(base + sep) ? p : null;
}

function route(pathname) {
  if (pathname === "/") return join(APP_DIR, "index.html");
  if (pathname === "/vendor/gsap.min.js") return GSAP_FILE;
  if (pathname.startsWith("/vendor/font/")) return inside(FONT_DIR, pathname.slice("/vendor/font/".length));
  if (pathname.startsWith("/screens/")) return inside(SCREENS_DIR, pathname.slice("/screens/".length));
  if (/^\/(src|music|refs|voce)\//.test(pathname) || pathname === "/beats.md" || pathname === "/music.json")
    return inside(APP_DIR, pathname.slice(1));
  return null;
}

export function startServer(port = 0) {
  const server = createServer((req, res) => {
    const { pathname } = new URL(req.url ?? "/", "http://localhost");
    const file = route(pathname);
    if (pathname === "/voce/voce.json" && !existsSync(file)) {
      // voce non ancora generata: risposta vuota invece di un 404 rumoroso nella console
      res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" }).end("null");
      return;
    }
    if (!file || !existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" }).end(`Non trovato: ${pathname}`);
      return;
    }
    const size = statSync(file).size;
    const type = TYPES[extname(file).toLowerCase()] ?? "application/octet-stream";
    const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range ?? "");
    if (range) {
      // l'anteprima con l'audio fa richieste parziali quando si salta in un punto della timeline
      const start = range[1] ? Number(range[1]) : 0;
      const end = range[2] ? Number(range[2]) : size - 1;
      res.writeHead(206, {
        "content-type": type,
        "content-range": `bytes ${start}-${end}/${size}`,
        "accept-ranges": "bytes",
        "content-length": end - start + 1,
        "cache-control": "no-store",
      });
      createReadStream(file, { start, end }).pipe(res);
      return;
    }
    res.writeHead(200, {
      "content-type": type,
      "content-length": size,
      "accept-ranges": "bytes",
      "cache-control": "no-store",
    });
    createReadStream(file).pipe(res);
  });
  return new Promise((ok) => server.listen(port, "127.0.0.1", () => ok({ server, port: server.address().port })));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { port } = await startServer(Number(process.env.PORT ?? 5180));
  console.log(`Anteprima: http://127.0.0.1:${port}/   (spazio = play/pausa, ←/→ = un beat, S = ripeti la scena)`);
}
