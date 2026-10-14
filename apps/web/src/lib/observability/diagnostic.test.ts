import type { LogLine } from "@loyalty/shared/logger";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { refreshDiagnosticModes, resetDiagnosticCache, type DiagnosticStore } from "./diagnostic";
import { diagnosticLevelFor, setActiveDiagnosticModes, type DiagnosticMode } from "./diagnostic-state";
import { captureLogs } from "./test-utils";

vi.mock("../supabase", () => ({ supabaseAdmin: () => ({}) }));

const NOW = Date.parse("2026-11-03T10:00:00Z");
const mode = (over: Partial<DiagnosticMode>): DiagnosticMode => ({
  id: "d1",
  scope_type: "shop",
  scope_id: "shop-a",
  scope_label: "salone-a",
  level: "debug",
  reason: "timbri non arrivano",
  enabled_by: "enea",
  enabled_at: "2026-11-03T09:00:00Z",
  expires_at: "2026-11-04T09:00:00Z",
  ...over,
});

let lines: LogLine[];
beforeEach(() => {
  lines = captureLogs();
  resetDiagnosticCache();
});

describe("livello per contesto", () => {
  it("debug solo nello scope indicato (negozio, utente staff, cliente)", () => {
    setActiveDiagnosticModes([
      mode({ scope_type: "shop", scope_id: "shop-a" }),
      mode({ id: "d2", scope_type: "staff_user", scope_id: "user-1", level: "trace" }),
      mode({ id: "d3", scope_type: "customer", scope_id: "cust-1" }),
    ]);
    expect(diagnosticLevelFor({ shop_id: "shop-a" }, "info", NOW)).toBe("debug");
    expect(diagnosticLevelFor({ shop_id: "shop-b" }, "info", NOW)).toBe("info");
    expect(diagnosticLevelFor({ user_id: "user-1" }, "info", NOW)).toBe("trace");
    expect(diagnosticLevelFor({ customer_ref: "cust-1" }, "info", NOW)).toBe("debug");
    expect(diagnosticLevelFor({}, "info", NOW)).toBe("info");
    // il più verboso vince
    expect(diagnosticLevelFor({ shop_id: "shop-a", user_id: "user-1" }, "info", NOW)).toBe("trace");
  });

  it("scade da sola anche prima della prossima rilettura", () => {
    setActiveDiagnosticModes([mode({ expires_at: "2026-11-03T10:00:01Z" })]);
    expect(diagnosticLevelFor({ shop_id: "shop-a" }, "info", NOW)).toBe("debug");
    expect(diagnosticLevelFor({ shop_id: "shop-a" }, "info", NOW + 2000)).toBe("info");
  });
});

describe("rilettura dal database", () => {
  const store = (open: DiagnosticMode[], closed: DiagnosticMode[] = []) =>
    ({
      listOpen: vi.fn(async () => open),
      closeExpired: vi.fn(async () => closed),
    }) satisfies DiagnosticStore;

  it("attiva le modalità valide e registra una volta le scadute", async () => {
    const expired = mode({ id: "old", scope_id: "shop-b", expires_at: "2026-11-03T09:59:00Z" });
    const s = store([mode({}), expired], [expired]);
    await refreshDiagnosticModes(s, NOW);

    expect(s.closeExpired).toHaveBeenCalledOnce();
    const ev = lines.filter((l) => l.event === "diagnostic.mode.expired");
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ diagnostic_id: "old", scope_label: "salone-a" });
    expect(diagnosticLevelFor({ shop_id: "shop-a" }, "info", NOW)).toBe("debug");
    expect(diagnosticLevelFor({ shop_id: "shop-b" }, "info", NOW)).toBe("info");
  });

  it("se un'altra istanza ha già chiuso la scadenza, non la registra di nuovo", async () => {
    const expired = mode({ id: "old", expires_at: "2026-11-03T09:59:00Z" });
    await refreshDiagnosticModes(store([expired], []), NOW);
    expect(lines.filter((l) => l.event === "diagnostic.mode.expired")).toHaveLength(0);
  });

  it("rilegge al massimo ogni 30 secondi", async () => {
    const s = store([mode({})]);
    await refreshDiagnosticModes(s, NOW);
    await refreshDiagnosticModes(s, NOW + 10_000);
    expect(s.listOpen).toHaveBeenCalledOnce();
    await refreshDiagnosticModes(s, NOW + 31_000);
    expect(s.listOpen).toHaveBeenCalledTimes(2);
  });

  it("se la lettura fallisce lo segnala e non blocca la richiesta", async () => {
    const s: DiagnosticStore = {
      listOpen: async () => {
        throw new Error("fetch failed");
      },
      closeExpired: async () => [],
    };
    await expect(refreshDiagnosticModes(s, NOW)).resolves.toBeUndefined();
    expect(lines.find((l) => l.event === "diagnostic.mode.read_failed")).toMatchObject({ level: "warn" });
  });
});
