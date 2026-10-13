import { describe, expect, it } from "vitest";
import { events, type EventName } from "./events";
import { buildLogLine, logEvent } from "../logger";

const names = Object.keys(events) as EventName[];

describe("catalogo eventi", () => {
  it.each(names)("%s: nome nel formato dominio.oggetto.azione[.esito]", (name) => {
    expect(name).toMatch(/^[a-z_]+(\.[a-z_]+){2,3}$/);
  });

  it.each(names)("%s: il msg di esempio è completo e senza valori vuoti", (name) => {
    const def = events[name];
    const msg = (def.msg as (f: unknown) => string)(def.example);
    expect(msg).not.toMatch(/undefined|null|NaN|\[object Object\]/);
    expect(msg.trim().endsWith(".")).toBe(true);
    expect(msg.length).toBeGreaterThan(40);
    // tutti i valori testuali dell'esempio compaiono davvero nella frase
    for (const value of Object.values(def.example)) {
      if (typeof value === "string" && !value.startsWith("E_")) expect(msg).toContain(value);
    }
  });

  it.each(names)("%s: ha descrizione per il runbook", (name) => {
    expect(events[name].description.length).toBeGreaterThan(20);
  });
});

describe("emettitore di log", () => {
  const now = () => new Date("2026-10-13T09:32:14.512Z");

  it("produce JSON con campi standard, campi strutturati e msg", () => {
    const lines: string[] = [];
    logEvent("server.startup.ok", events["server.startup.ok"].example, {
      format: "json",
      write: (l) => lines.push(l),
      now,
    });
    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0] ?? "");
    expect(parsed).toMatchObject({
      ts: "2026-10-13T09:32:14.512Z",
      level: "info",
      event: "server.startup.ok",
      env: "development",
      google_wallet_enabled: false,
    });
    expect(parsed.msg).toContain("Google Wallet disattivato");
  });

  it("in formato leggibile mostra ora, livello e msg", () => {
    const lines: string[] = [];
    logEvent("server.startup.failed", events["server.startup.failed"].example, {
      format: "pretty",
      write: (l) => lines.push(l),
      now,
    });
    expect(lines[0]).toMatch(/^09:32:14 ERROR Avvio del server web/);
  });

  it("il livello viene dal catalogo", () => {
    expect(buildLogLine("server.startup.failed", events["server.startup.failed"].example).level).toBe("error");
  });
});
