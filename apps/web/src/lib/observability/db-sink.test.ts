import type { LogLine } from "@loyalty/shared/logger";
import { afterEach, describe, expect, it } from "vitest";
import { dbSinkEnabled, toRow } from "./db-sink";

const line = (over: Partial<LogLine> = {}): LogLine => ({
  ts: "2026-11-03T09:32:14.512Z",
  level: "info",
  event: "stamp.add.ok",
  msg: "Giulia (operatore, iOS 1.4.0) ha aggiunto un timbro alla carta A3F2C91B.",
  request_id: "01JB7K3QX0000000000000000A",
  shop_id: "11111111-1111-4111-8111-111111111111",
  user_id: "22222222-2222-4222-8222-222222222222",
  customer_ref: "A3F2C91B",
  platform: "ios",
  ...over,
});

describe("copia dei log per la vista Assistenza", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it("riga con i campi di ricerca separati e la riga completa in fields", () => {
    const r = toRow(line({ error_code: "E_STAMP_COOLDOWN", level: "warn" }));
    expect(r).toMatchObject({
      level: "warn",
      event: "stamp.add.ok",
      request_id: "01JB7K3QX0000000000000000A",
      shop_id: "11111111-1111-4111-8111-111111111111",
      customer_ref: "A3F2C91B",
      error_code: "E_STAMP_COOLDOWN",
      diagnostic: false,
    });
    expect(r.fields.msg).toContain("A3F2C91B");
  });

  it("debug e trace sono righe di modalità diagnostica (tenute 7 giorni)", () => {
    expect(toRow(line({ level: "debug" })).diagnostic).toBe(true);
    expect(toRow(line({ level: "trace" })).diagnostic).toBe(true);
    expect(toRow(line({ level: "error" })).diagnostic).toBe(false);
  });

  it("shop_id e user_id non UUID non finiscono nelle colonne uuid", () => {
    const r = toRow(line({ shop_id: "salone-mario", user_id: "" }));
    expect(r.shop_id).toBeNull();
    expect(r.user_id).toBeNull();
  });

  it("LOG_DB_SINK: on e off vincono; senza valore spenta solo nei test", () => {
    process.env.LOG_DB_SINK = "on";
    expect(dbSinkEnabled()).toBe(true);
    process.env.LOG_DB_SINK = "off";
    expect(dbSinkEnabled()).toBe(false);
    delete process.env.LOG_DB_SINK;
    expect(dbSinkEnabled()).toBe(process.env.NODE_ENV !== "test");
  });
});
