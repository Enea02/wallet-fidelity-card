import { describe, expect, it } from "vitest";
import { isEmail, passwordProblem } from "./validation";

describe("validazione dei moduli", () => {
  it("email", () => {
    expect(isEmail(" giulia@salone.it ")).toBe(true);
    expect(isEmail("giulia@salone")).toBe(false);
    expect(isEmail("giulia salone.it")).toBe(false);
  });
  it("password nuova e conferma", () => {
    expect(passwordProblem("corta", "corta").password).toMatch(/8 caratteri/);
    expect(passwordProblem("lunga-abbastanza", "diversa-davvero").confirm).toMatch(/non coincidono/);
    expect(passwordProblem("lunga-abbastanza", "lunga-abbastanza")).toEqual({});
  });
});
