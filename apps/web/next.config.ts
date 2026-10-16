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
};

export default nextConfig;
