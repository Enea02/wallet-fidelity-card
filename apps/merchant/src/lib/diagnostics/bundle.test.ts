import { describe, expect, it } from "vitest";
import type { LogLine } from "@loyalty/shared/logger";
import { fitBundle, utf8Length } from "./bundle";

const ev = (i: number, pad = 0): LogLine => ({
  ts: "2026-10-14T10:00:00.000Z",
  level: "info",
  event: "app.online",
  msg: `#${i} ${"x".repeat(pad)}`,
});

describe("pacchetto della diagnostica", () => {
  it("conta i byte UTF-8 (accenti, emoji)", () => {
    expect(utf8Length("abc")).toBe(3);
    expect(utf8Length("è")).toBe(2);
    expect(utf8Length("€")).toBe(3);
    expect(utf8Length("😀")).toBe(4);
  });

  it("sotto il limite non scarta nulla", () => {
    const r = fitBundle({ os: "iOS" }, [ev(1), ev(2)], "nota");
    expect(r.dropped).toBe(0);
    expect(r.body.events).toHaveLength(2);
    expect(r.body.note).toBe("nota");
  });

  it("sopra il limite scarta gli eventi più vecchi e tiene i più recenti", () => {
    const events = Array.from({ length: 500 }, (_, i) => ev(i, 900));
    const r = fitBundle({ os: "iOS" }, events, undefined, 100_000);
    expect(r.size).toBeLessThanOrEqual(100_000);
    expect(r.dropped).toBeGreaterThan(0);
    expect(r.body.events.at(-1)?.msg.startsWith("#499")).toBe(true);
    expect(r.body).not.toHaveProperty("note");
  });
});
