import { execSync } from "node:child_process";
import { networkInterfaces } from "node:os";
import type { NextConfig } from "next";
import pkg from "./package.json" with { type: "json" };

function gitCommit(): string {
  if (process.env.APP_COMMIT_SHA) return process.env.APP_COMMIT_SHA.slice(0, 7);
  try {
    return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return "sconosciuto";
  }
}

/** Indirizzi IPv4 del Mac sulla rete locale: pagine aperte dal telefono sulla stessa rete (solo `next dev`). */
function lanAddresses(): string[] {
  return Object.values(networkInterfaces())
    .flat()
    .filter((i) => i && i.family === "IPv4" && !i.internal)
    .map((i) => i!.address);
}

/** Prefisso della web app esercente (lo stesso di EXPO_WEB_BASE_URL in apps/merchant/scripts/build-web.mjs). */
const MERCHANT_BASE = "/app";
/** Schermate dell'app: tutto tranne le cartelle dei file statici e i percorsi con un'estensione (file mancanti → 404). */
const MERCHANT_SCREEN = "(?!_expo/|assets/|icons/|zxing/)(?!.*\\.[a-z0-9]+$).*";

/**
 * Solo `pnpm dev`: l'app esercente non è compilata ma servita da Metro (MERCHANT_DEV_URL, es.
 * http://localhost:8081, avviato con baseUrl /app e --no-dev perché expo-router applica il prefisso
 * solo fuori dalla modalità dev). Next inoltra a Metro le schermate e i percorsi da cui Metro serve
 * bundle e asset, così in sviluppo c'è un solo indirizzo (http://localhost:3000) come in produzione.
 */
function merchantDevProxy() {
  const target = process.env.MERCHANT_DEV_URL?.replace(/\/$/, "");
  if (!target || process.env.NODE_ENV === "production") return [];
  return [
    { source: MERCHANT_BASE, destination: `${target}${MERCHANT_BASE}` },
    { source: `${MERCHANT_BASE}/:path*`, destination: `${target}${MERCHANT_BASE}/:path*` },
    // bundle, asset e sorgenti per gli stack trace: Metro li serve dalla radice del monorepo
    ...["apps", "node_modules", "packages", "assets", "_expo", "symbolicate"].map((dir) => ({
      source: `/${dir}/:path*`,
      destination: `${target}/${dir}/:path*`,
    })),
    { source: "/assets", destination: `${target}/assets` },
  ];
}

const nextConfig: NextConfig = {
  // google-auth-library usa moduli Node: resta lato server
  serverExternalPackages: ["jsonwebtoken", "@react-pdf/renderer"],
  // font del cartello A5, letti da node_modules a runtime: vanno inclusi nel bundle del deploy
  outputFileTracingIncludes: {
    "/api/v1/merchant/counter-qr.pdf": ["./assets/fonts/*.woff"],
  },
  // packages/shared è TypeScript sorgente: lo compila Next
  transpilePackages: ["@loyalty/shared"],
  // solo `next dev`: pagine aperte da un telefono tramite tunnel (prova del cartello, README) o sulla rete locale
  allowedDevOrigins: ["*.trycloudflare.com", ...lanAddresses()],
  // versione e commit finiscono nel log di avvio e (dalla Fase 1) in ogni riga
  env: { APP_VERSION: pkg.version, APP_COMMIT_SHA: gitCommit() },
  // le istruzioni per gli agenti stanno in CLAUDE.md alla radice
  agentRules: false,
  // web app esercente (export di apps/merchant copiato in public/app da scripts/copy-merchant.mjs):
  // i file esistenti li serve Next da public/, ogni altro percorso sotto /app è una schermata
  // dell'app a pagina singola e riceve index.html. "afterFiles": prima delle route dinamiche,
  // quindi /app non finisce mai in [shop] (e "app" è anche uno slug riservato).
  async rewrites() {
    return {
      beforeFiles: merchantDevProxy(),
      afterFiles: [
        { source: MERCHANT_BASE, destination: `${MERCHANT_BASE}/index.html` },
        { source: `${MERCHANT_BASE}/:path(${MERCHANT_SCREEN})`, destination: `${MERCHANT_BASE}/index.html` },
      ],
      fallback: [],
    };
  },
  async headers() {
    return [
      // pagina e service worker sempre ricontrollati (versione nuova subito dopo un deploy); niente indicizzazione
      {
        source: `${MERCHANT_BASE}/:path*`,
        headers: [
          { key: "x-robots-tag", value: "noindex, nofollow" },
          { key: "cache-control", value: "no-cache" },
        ],
      },
      {
        source: MERCHANT_BASE,
        headers: [
          { key: "x-robots-tag", value: "noindex, nofollow" },
          { key: "cache-control", value: "no-cache" },
        ],
      },
      // il SW sta in /app/sw.js ma controlla anche "/app" (senza "/" finale: Next reindirizza "/app/" lì)
      { source: `${MERCHANT_BASE}/sw.js`, headers: [{ key: "service-worker-allowed", value: MERCHANT_BASE }] },
      // file con l'hash nel nome: non cambiano mai
      ...["_expo", "assets"].map((dir) => ({
        source: `${MERCHANT_BASE}/${dir}/:path*`,
        headers: [{ key: "cache-control", value: "public, max-age=31536000, immutable" }],
      })),
    ];
  },
};

export default nextConfig;
