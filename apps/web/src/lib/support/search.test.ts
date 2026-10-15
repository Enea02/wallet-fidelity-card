import { describe, expect, it } from "vitest";
import { classifySupportQuery } from "./search";

describe("ricerca della vista Assistenza: tipo riconosciuto dal testo", () => {
  it.each([
    ["ERR-7K3QX", "codice errore", "ERR-7K3QX"],
    ["err 7k3qx", "codice errore", "ERR-7K3QX"],
    ["ERR-7K3QO", "codice errore", "ERR-7K3Q0"],
    ["01JB7K3QX0000000000000000A", "richiesta", "01JB7K3QX0000000000000000A"],
    ["diag-6k946se5", "ticket diagnostica", "DIAG-6K946SE5"],
    ["E_STAMP_COOLDOWN", "codice di errore del catalogo", "E_STAMP_COOLDOWN"],
    ["Giulia@Salone.it", "email staff", "giulia@salone.it"],
    ["333 123 4567", "telefono", "+393331234567"],
    ["+39 333 1234567", "telefono", "+393331234567"],
    ["dema2345", "carta", "DEMA2345"],
    ["salone", "negozio", "salone"],
    ["E_NON_ESISTE", "negozio", "E_NON_ESISTE"],
  ])("%s → %s", (input, kind, value) => {
    expect(classifySupportQuery(input)).toEqual({ kind, value });
  });
});
