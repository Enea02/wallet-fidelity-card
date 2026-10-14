#!/usr/bin/env node
// Lighthouse (profilo mobile) sulla pagina di iscrizione. Serve il server di produzione avviato:
//   pnpm --filter @loyalty/web build && PORT=3200 pnpm --filter @loyalty/web start
//   pnpm lighthouse [url]        (default http://localhost:3200/salone-demo)
// Il brief chiede almeno 90 in performance mobile.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const url = process.argv[2] ?? "http://localhost:3200/salone-demo";
const out = join(mkdtempSync(join(tmpdir(), "lh-")), "report.json");
const r = spawnSync(
  "npx",
  [
    "-y",
    "lighthouse@13.5.0",
    url,
    "--only-categories=performance,accessibility,best-practices,seo",
    "--chrome-flags=--headless=new",
    "--output=json",
    `--output-path=${out}`,
    "--quiet",
  ],
  { stdio: "inherit" },
);
if (r.status !== 0) process.exit(r.status ?? 1);
const report = JSON.parse(readFileSync(out, "utf8"));
const scores = Object.fromEntries(Object.entries(report.categories).map(([k, v]) => [k, Math.round(v.score * 100)]));
const a = report.audits;
console.log(`Lighthouse mobile ${url}`);
console.log(scores);
console.log(
  `LCP ${a["largest-contentful-paint"].displayValue} · FCP ${a["first-contentful-paint"].displayValue} · TBT ${a["total-blocking-time"].displayValue}`,
);
process.exit(scores.performance >= 90 ? 0 : 1);
