import { AppError } from "@loyalty/shared/errors";
import { describe, expect, it } from "vitest";
import { fromDbError } from "./db-errors";

const pg = (message: string, details: object | string | null = null) => ({
  code: "P0001",
  message,
  details: typeof details === "string" || details === null ? details : JSON.stringify(details),
});

describe("errori delle funzioni di dominio Postgres", () => {
  it("cooldown: codice del catalogo, minuti nel messaggio per i log e per l'utente", () => {
    const e = fromDbError(pg("E_STAMP_COOLDOWN", { minutes_since: 8, cooldown_min: 60, minutes_left: 52 }));
    expect(e).toBeInstanceOf(AppError);
    expect(e).toMatchObject({
      code: "E_STAMP_COOLDOWN",
      message: "ultimo timbro 8 minuti fa, il negozio richiede almeno 60 minuti tra due timbri",
      userMessage: "Ultimo timbro 8 minuti fa: si potrà timbrare di nuovo tra 52 minuti.",
      context: { minutes_left: 52 },
    });
  });

  it("validazione: campo e problema", () => {
    expect(fromDbError(pg("E_VALIDATION", { field: "reason", problem: "il motivo è obbligatorio" }))).toMatchObject({
      code: "E_VALIDATION",
      message: "dati non validi, campo reason: il motivo è obbligatorio",
      userMessage: "Dati non validi: il motivo è obbligatorio.",
    });
  });

  it("annullamento di un altro operatore: dice chi ha dato il timbro", () => {
    expect(fromDbError(pg("E_UNDO_OTHER_OPERATOR", { stamped_by: "Marco" }))).toMatchObject({
      message: "il timbro è stato dato da Marco",
      userMessage: "Puoi annullare solo un timbro che hai dato tu: questo l'ha dato Marco.",
    });
  });

  it("codice del catalogo senza messaggio dedicato o con dettaglio non JSON: resta un errore del catalogo", () => {
    expect(fromDbError(pg("E_PRIVACY_CONSENT_REQUIRED"))).toMatchObject({ code: "E_PRIVACY_CONSENT_REQUIRED" });
    expect(fromDbError(pg("E_NO_REWARD", "non json"))).toMatchObject({ code: "E_NO_REWARD" });
  });

  it("errori del database che non sono del catalogo tornano invariati (diventano E_DB)", () => {
    const raw = { code: "23505", message: "duplicate key value violates unique constraint", details: null };
    expect(fromDbError(raw)).toBe(raw);
    const unknown = pg("E_AUDIT_IMMUTABLE");
    expect(fromDbError(unknown)).toBe(unknown);
  });
});
