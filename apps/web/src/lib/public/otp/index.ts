import "server-only";
import { optionalEnv } from "../../env";
import { testOtpProvider } from "./test-provider";
import { twilioOtpProvider } from "./twilio";

/** Esito del controllo di un codice presso il fornitore. */
export type OtpCheck = "approved" | "wrong" | "expired" | "too_many";

export interface OtpProvider {
  name: "twilio" | "test";
  /** Invia l'SMS. Lancia AppError (E_EXTERNAL_*) se il fornitore non lo invia. */
  send(phoneE164: string): Promise<{ durationMs: number }>;
  check(phoneE164: string, code: string): Promise<OtpCheck>;
}

/**
 * Fornitore OTP da OTP_PROVIDER: "twilio" (SMS veri, Twilio Verify) o "test" (codice fisso 123456,
 * nessun SMS: solo sviluppo e test, rifiutato all'avvio in produzione da server-env.ts).
 */
export function otpProvider(): OtpProvider {
  return (optionalEnv("OTP_PROVIDER") ?? "test") === "twilio" ? twilioOtpProvider : testOtpProvider;
}
