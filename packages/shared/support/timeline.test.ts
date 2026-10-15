import { describe, expect, it } from "vitest";
import { auditDiff, auditItem, explainError, groupTimeline, stepLabel, type TimelineItem } from "./timeline";

const RID = "01JB7K3QX0000000000000000A";
const item = (over: Partial<TimelineItem>): TimelineItem => ({
  ts: "2026-11-03T09:32:14.000Z",
  source: "log",
  level: "info",
  event: "stamp.add.ok",
  msg: "Giulia (operatore, iOS 1.4.0) ha aggiunto un timbro alla carta A3F2C91B: 6 → 7 su 10.",
  request_id: RID,
  error_code: null,
  fields: {},
  ...over,
});

describe("timeline della vista Assistenza", () => {
  it("raggruppa per request_id: titolo dalla riga di dominio, passi in breve, livello più grave", () => {
    const blocks = groupTimeline([
      item({ ts: "2026-11-03T09:32:14.100Z", event: "http.request.start", msg: "Richiesta POST /stamp" }),
      item({ ts: "2026-11-03T09:32:14.300Z" }),
      item({
        ts: "2026-11-03T09:32:14.700Z",
        event: "wallet.google.patch.failed",
        level: "error",
        msg: "Aggiornamento su Google Wallet fallito per la carta A3F2C91B: credenziali rifiutate (401).",
        error_code: "E_GOOGLE_AUTH",
        fields: { http_status: 401, duration_ms: 120 },
      }),
      item({
        ts: "2026-11-03T09:32:14.400Z",
        event: "http.request.end",
        msg: "POST /stamp completata con 200",
        fields: { status: 200, duration_ms: 182 },
      }),
    ]);
    expect(blocks).toHaveLength(1);
    const b = blocks[0]!;
    expect(b.support_code).toBe("ERR-7K3QX");
    expect(b.title).toContain("ha aggiunto un timbro");
    expect(b.level).toBe("error");
    expect(b.steps).toEqual(["stamp add ok", "risposta 200 182 ms", "Google errore 401 120 ms"]);
    expect(b.errors.map((e) => e.code)).toEqual(["E_GOOGLE_AUTH"]);
    expect(b.errors[0]!.action).toMatch(/GOOGLE_WALLET_SA_KEY_B64|service account/i);
  });

  it("blocchi dal più recente; righe senza request_id isolate", () => {
    const blocks = groupTimeline([
      item({ ts: "2026-11-03T09:00:00.000Z", request_id: null, event: "cron.wallet_sync.run", msg: "Cron" }),
      item({ ts: "2026-11-03T10:00:00.000Z", request_id: "01JB7K3QX0000000000000000B" }),
      item({ ts: "2026-11-03T09:30:00.000Z" }),
    ]);
    expect(blocks.map((b) => b.ts)).toEqual([
      "2026-11-03T10:00:00.000Z",
      "2026-11-03T09:30:00.000Z",
      "2026-11-03T09:00:00.000Z",
    ]);
    expect(blocks[2]!.request_id).toBeNull();
  });

  it("errore del catalogo: descrizione, causa e azione; codici sconosciuti ignorati", () => {
    expect(explainError("E_STAMP_COOLDOWN")).toMatchObject({ code: "E_STAMP_COOLDOWN" });
    expect(explainError("E_STAMP_COOLDOWN")!.probableCause.length).toBeGreaterThan(10);
    expect(explainError("E_NON_ESISTE")).toBeNull();
    expect(explainError(null)).toBeNull();
  });

  it("audit leggibile: azione, attore, solo i campi cambiati, motivo", () => {
    const a = auditItem({
      ts: "2026-11-03T09:32:14.000Z",
      request_id: RID,
      actor_type: "support",
      actor_id: "Enea",
      action: "shop_suspend",
      entity: "shop",
      entity_id: "x",
      before: { status: "active" },
      after: { status: "suspended" },
      reason: "abbonamento non rinnovato",
      platform: "interno",
    });
    expect(a.msg).toBe(
      "Storico: sospensione del negozio da Enea (assistenza) — status active → suspended. Motivo: abbonamento non rinnovato.",
    );
    expect(auditDiff({ stamps: 6, rewards: 0 }, { stamps: 7, rewards: 0 })).toBe("stamps 6 → 7");
    expect(stepLabel(a)).toBe("storico: sospensione");
  });
});
