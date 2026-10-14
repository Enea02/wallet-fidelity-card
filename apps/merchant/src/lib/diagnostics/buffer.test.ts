import { afterEach, describe, expect, it, vi } from "vitest";
import { createLogger, type LogLine } from "@loyalty/shared/logger";
import { EventBuffer, type BufferStore } from "./buffer";

const memoryStore = (initial: string | null = null): BufferStore & { value: string | null } => {
  const s = {
    value: initial,
    load: async () => s.value,
    save: async (v: string) => {
      s.value = v;
    },
  };
  return s;
};

const line = (i: number): LogLine => ({
  ts: new Date(i).toISOString(),
  level: "info",
  event: "app.offline",
  msg: `#${i}`,
});

afterEach(() => vi.useRealTimers());

describe("buffer della diagnostica", () => {
  it("tiene solo gli ultimi 500 eventi", () => {
    const b = new EventBuffer();
    for (let i = 0; i < 620; i++) b.push(line(i));
    expect(b.size).toBe(500);
    expect(b.snapshot()[0]?.msg).toBe("#120");
    expect(b.snapshot().at(-1)?.msg).toBe("#619");
  });

  it("salva su disco (in differita) e ricarica dopo un riavvio, prima degli eventi nuovi", async () => {
    vi.useFakeTimers();
    const store = memoryStore();
    const a = new EventBuffer(store, 500, 1000);
    a.push(line(1));
    a.push(line(2));
    expect(store.value).toBeNull();
    await vi.advanceTimersByTimeAsync(1000);
    expect(JSON.parse(store.value ?? "[]")).toHaveLength(2);

    const b = new EventBuffer(store);
    b.push(line(3));
    await b.restore();
    expect(b.snapshot().map((l) => l.msg)).toEqual(["#1", "#2", "#3"]);
  });

  it("un buffer salvato illeggibile non blocca l'app", async () => {
    const b = new EventBuffer(memoryStore("{non json"));
    await b.restore();
    expect(b.size).toBe(0);
  });

  it("riceve righe già redatte dal logger: niente email, token o telefono in chiaro", () => {
    const b = new EventBuffer();
    const log = createLogger({ sink: (_t, l) => b.push(l) });
    log.event("app.login.failed", {
      email: "giulia.rossi@salone.it",
      error_code: "E_LOGIN_FAILED",
      reason: "token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.abc123def e telefono +39 333 1234567",
    });
    const text = JSON.stringify(b.snapshot());
    expect(text).not.toContain("giulia.rossi@");
    expect(text).not.toContain("eyJhbGciOiJIUzI1NiJ9");
    expect(text).not.toContain("1234567");
    expect(text).toContain("gi***@salone.it");
  });
});
