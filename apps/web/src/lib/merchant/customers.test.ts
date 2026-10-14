import { describe, expect, it, vi } from "vitest";

vi.mock("../supabase", () => ({ supabaseAdmin: () => ({}) }));
const { classifyQuery } = await import("./customers");

describe("ricerca clienti: cosa ha scritto il titolare", () => {
  it.each([
    [undefined, "tutti", ""],
    ["  ", "tutti", ""],
    ["333 123 4567", "telefono", "+393331234567"],
    ["+39 333-123-4567", "telefono", "+393331234567"],
    ["0041791234567", "telefono", "+41791234567"],
    ["a3f2c9bk", "codice breve", "A3F2C9BK"],
    ["Mario", "nome", "Mario"],
    ["23456789", "telefono", "+3923456789"],
  ])("%j → %s", (q, kind, value) => {
    expect(classifyQuery(q)).toEqual({ kind, value });
  });
});
