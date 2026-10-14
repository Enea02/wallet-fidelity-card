// Server statico minimo per la web app esportata (dist-e2e): file se esiste, altrimenti index.html
// (app a pagina singola: /invito, /profilo… li gestisce Expo Router nel browser).
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";

const [dir = "dist-e2e", port = "8090"] = process.argv.slice(2);
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".ttf": "font/ttf",
  ".svg": "image/svg+xml",
};

createServer((req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname)).replace(/^(\.\.[/\\])+/, "");
  let file = join(dir, path);
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(dir, "index.html");
  res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
  createReadStream(file).pipe(res);
  // eslint-disable-next-line no-console -- server di supporto dei test: l'output a terminale è voluto
}).listen(Number(port), () => console.log(`web app esercente su http://localhost:${port}`));
