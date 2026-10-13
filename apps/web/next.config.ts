import { execSync } from "node:child_process";
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

const nextConfig: NextConfig = {
  // google-auth-library usa moduli Node: resta lato server
  serverExternalPackages: ["google-auth-library", "jsonwebtoken"],
  // packages/shared è TypeScript sorgente: lo compila Next
  transpilePackages: ["@loyalty/shared"],
  // versione e commit finiscono nel log di avvio e (dalla Fase 1) in ogni riga
  env: { APP_VERSION: pkg.version, APP_COMMIT_SHA: gitCommit() },
};

export default nextConfig;
