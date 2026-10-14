import "server-only";
import { AppError } from "@loyalty/shared/errors";
import { optionalEnv, requireEnv } from "../../env";
import { fetchExternal } from "../../observability/fetch-external";
import type { OtpCheck, OtpProvider } from "./index";

/*
 * Twilio Verify (SMS): invio del codice e controllo. Chiamate con fetchExternal in modalità quiet:
 * l'esito lo registrano gli eventi enroll.otp.* (una riga per problema).
 * TWILIO_VERIFY_API_BASE serve solo ai test (API simulata).
 */

const base = () => (optionalEnv("TWILIO_VERIFY_API_BASE") ?? "https://verify.twilio.com").replace(/\/$/, "");
const service = () => requireEnv("TWILIO_VERIFY_SERVICE_SID");
const auth = () =>
  `Basic ${Buffer.from(`${requireEnv("TWILIO_ACCOUNT_SID")}:${requireEnv("TWILIO_AUTH_TOKEN")}`).toString("base64")}`;

function call(operation: string, path: string, form: Record<string, string>) {
  return fetchExternal({
    provider: "twilio",
    operation,
    url: `${base()}/v2/Services/${service()}${path}`,
    method: "POST",
    headers: { authorization: auth(), "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form).toString(),
    quiet: true,
  });
}

export const twilioOtpProvider: OtpProvider = {
  name: "twilio",
  async send(phone) {
    const started = performance.now();
    await call("invio OTP", "/Verifications", { To: phone, Channel: "sms", Locale: "it" });
    return { durationMs: Math.round(performance.now() - started) };
  },
  async check(phone, code): Promise<OtpCheck> {
    try {
      const res = await call("controllo OTP", "/VerificationCheck", { To: phone, Code: code });
      const json = (await res.json()) as { status?: string };
      return json.status === "approved" ? "approved" : "wrong";
    } catch (e) {
      // 404: nessuna verifica in corso (scaduta dopo 10 minuti o già chiusa); 429: troppi tentativi
      const status = e instanceof AppError ? e.context.http_status : undefined;
      if (status === 404) return "expired";
      if (status === 429) return "too_many";
      throw e;
    }
  },
};
