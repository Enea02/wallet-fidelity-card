import "server-only";
import type { OtpProvider } from "./index";

/** Codice fisso per sviluppo e test end-to-end: nessun SMS, nessun costo. Mai in produzione. */
export const TEST_OTP_CODE = "123456";

export const testOtpProvider: OtpProvider = {
  name: "test",
  async send() {
    return { durationMs: 0 };
  },
  async check(_phone, code) {
    return code === TEST_OTP_CODE ? "approved" : "wrong";
  },
};
