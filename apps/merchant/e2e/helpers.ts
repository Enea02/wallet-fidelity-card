import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { expect, type Page } from "@playwright/test";

export const API = "http://localhost:3110";
export const PASSWORD = "password-demo-locale";
export const OWNER = "staff@salone-demo.test";
export const OPERATOR = "operatore@salone-demo.test";
export const SALONE = "11111111-1111-4111-8111-111111111111";

const status = JSON.parse(
  execFileSync("supabase", ["status", "-o", "json"], { stdio: ["ignore", "pipe", "ignore"] }).toString(),
) as Record<string, string>;
export const SUPABASE_URL = status.API_URL ?? "";
const ANON = status.ANON_KEY ?? "";
const MAILPIT = (status.MAILPIT_URL ?? status.INBUCKET_URL ?? "http://127.0.0.1:54324").replace(/\/$/, "");

export async function login(page: Page, email: string, password = PASSWORD) {
  await page.goto("/");
  await page.getByTestId("campo-email").fill(email);
  await page.getByTestId("campo-password").fill(password);
  await page.getByTestId("pulsante-accedi").click();
}

/** Righe JSON del log del backend (e2e-logs/server.log). */
export function serverLog(): Array<Record<string, unknown>> {
  return readFileSync("e2e-logs/server.log", "utf8")
    .split("\n")
    .filter((l) => l.startsWith("{"))
    .map((l) => JSON.parse(l) as Record<string, unknown>);
}

export async function expectLogLine(match: (l: Record<string, unknown>) => boolean) {
  await expect.poll(() => serverLog().some(match), { timeout: 10_000 }).toBe(true);
  return serverLog().find(match)!;
}

/** Token di uno staff (login con password, come l'app). */
export async function accessToken(email: string, password = PASSWORD): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = (await res.json()) as { access_token?: string };
  if (!body.access_token) throw new Error(`login di ${email} non riuscito: ${res.status}`);
  return body.access_token;
}

/** Link dell'ultima email arrivata a `to` in Mailpit (invito o recupero password). */
export async function emailLink(to: string, subject: RegExp): Promise<string> {
  let link = "";
  await expect
    .poll(
      async () => {
        const list = (await (
          await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`)
        ).json()) as {
          messages: Array<{ ID: string; Subject: string }>;
        };
        const msg = list.messages.find((m) => subject.test(m.Subject));
        if (!msg) return "";
        const full = (await (await fetch(`${MAILPIT}/api/v1/message/${msg.ID}`)).json()) as { HTML: string };
        link = /href="([^"]*\/auth\/v1\/verify[^"]*)"/.exec(full.HTML)?.[1]?.replace(/&amp;/g, "&") ?? "";
        return link;
      },
      { timeout: 15_000 },
    )
    .not.toBe("");
  return link;
}

/** Modifica la sessione salvata da supabase-js nel browser (per simulare token scaduti). */
export async function tamperSession(page: Page, change: { access_token?: string; refresh_token?: string }) {
  await page.evaluate((c) => {
    const key = Object.keys(localStorage).find((k) => k.startsWith("sb-") && k.endsWith("-auth-token"));
    if (!key) throw new Error("sessione non trovata nel localStorage");
    const s = JSON.parse(localStorage.getItem(key) ?? "{}") as Record<string, unknown>;
    localStorage.setItem(key, JSON.stringify({ ...s, ...c }));
  }, change);
}
