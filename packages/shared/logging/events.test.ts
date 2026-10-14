import { describe, expect, it } from "vitest";
import { errors } from "../errors";
import { events, type EventName } from "./events";

const names = Object.keys(events) as EventName[];
const cases = names.flatMap((name) =>
  (events[name].examples as readonly unknown[]).map((example, i) => [`${name} #${i + 1}`, name, example] as const),
);

describe("catalogo eventi", () => {
  it.each(names)("%s: nome nel formato dominio.oggetto.azione[.esito] (il brief usa anche dominio.azione)", (name) => {
    expect(name).toMatch(/^[a-z_]+(\.[a-z_]+){1,3}$/);
  });

  it.each(cases)("%s: il msg è una frase completa senza valori vuoti", (_label, name, example) => {
    const msg = (events[name].msg as (f: unknown) => string)(example);
    expect(msg).not.toMatch(/undefined|\bnull\b|NaN|\[object Object\]|\$\{/);
    expect(msg).toMatch(/^[A-Z0-9]/);
    expect(msg.trim()).toMatch(/[.!]$/);
    expect(msg.length).toBeGreaterThan(30);
  });

  it.each(names)("%s: ha una descrizione per il runbook", (name) => {
    expect(events[name].description.length).toBeGreaterThan(20);
  });
});

describe("catalogo errori", () => {
  it.each(Object.entries(errors))("%s: completo e coerente", (code, def) => {
    expect(code).toMatch(/^E_[A-Z_]+$/);
    expect(def.status).toBeGreaterThanOrEqual(400);
    for (const text of [def.userMessage, def.description, def.probableCause, def.action]) {
      expect(text.length).toBeGreaterThan(5);
      expect(text.trim()).toMatch(/[.!]$/);
    }
  });
});
