import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

/** Dopo tutti gli scenari: i log del server non contengono telefoni dei clienti né nomi (brief Fase 5). */
test("nessun telefono né nome nei log del server", () => {
  const log = readFileSync("e2e-logs/server.log", "utf8");
  expect(log.length).toBeGreaterThan(1000);
  expect(log).toContain('"event":"enroll.otp.verified"'); // il funnel c'è
  expect(log).not.toMatch(/3470\d{6}/); // telefoni dei test in chiaro
  expect(log).not.toContain("Zefiro");
  expect(log).not.toContain("123456"); // il codice OTP
});
