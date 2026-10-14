import { describe, expect, it } from "vitest";
import { checkItalianMobile } from "./phone";

describe("telefono del cliente", () => {
  it.each([
    ["333 123 4567", "+393331234567"],
    ["+39 333-123-4567", "+393331234567"],
    ["0039 333.123.4567", "+393331234567"],
    ["(333) 1234567", "+393331234567"],
    ["347 123 456", "+39347123456"],
  ])("%s → %s", (input, e164) => {
    expect(checkItalianMobile(input)).toMatchObject({ ok: true, e164 });
  });

  it("formato per lo schermo come nel design", () => {
    expect(checkItalianMobile("3331234567")).toMatchObject({ display: "+39 333 123 4567" });
  });

  it.each([
    ["", "vuoto"],
    ["347 12", "incompleto"],
    ["333 123 45678", "troppo_lungo"],
    ["06 1234 5678", "non_cellulare"],
    ["+41 79 123 45 67", "estero"],
    ["0041791234567", "estero"],
    ["333abc4567", "incompleto"],
  ])("%j → %s", (input, reason) => {
    expect(checkItalianMobile(input)).toMatchObject({ ok: false, reason });
  });

  it("messaggi come nel design", () => {
    expect(checkItalianMobile("347 12")).toMatchObject({ message: "Numero incompleto: servono 9 o 10 cifre." });
  });

  it("prefisso del campo separato diverso da +39: rifiutato", () => {
    expect(checkItalianMobile("791234567", "+41")).toMatchObject({ ok: false, reason: "estero" });
  });
});
