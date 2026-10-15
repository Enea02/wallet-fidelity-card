import { AppError } from "@loyalty/shared/errors";
import { redirect } from "next/navigation";
import { startEnrollment } from "@/lib/support/login";
import { ActionForm } from "../../_ui/ActionForm";
import { codeAction } from "../actions";

/** Primo accesso: collegamento dell'app di autenticazione (TOTP), obbligatorio per il pannello. */
export default async function Collega() {
  let enrollment;
  try {
    enrollment = await startEnrollment();
  } catch (e) {
    if (e instanceof AppError) redirect("/interno/accesso");
    throw e;
  }
  return (
    <section className="int-card int-narrow">
      <h1>Collega l&apos;app di autenticazione</h1>
      <p className="int-sub">
        Il pannello chiede sempre un secondo codice. Inquadra il QR con Google Authenticator, 1Password o un&apos;app
        simile, poi scrivi il codice a 6 cifre.
      </p>
      {/* eslint-disable-next-line @next/next/no-img-element -- QR generato da Supabase come data URL SVG */}
      <img className="int-qr" src={enrollment.qrCode} alt="QR da inquadrare con l'app di autenticazione" />
      <p className="int-muted">
        Se il QR non si legge, inserisci a mano questa chiave:{" "}
        <span className="int-code" data-testid="totp-segreto">
          {enrollment.secret}
        </span>
      </p>
      <ActionForm action={codeAction} submit="Collega ed entra" testId="collega">
        <input type="hidden" name="factorId" value={enrollment.factorId} />
        <label>
          Codice
          <input
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={7}
            required
            data-testid="codice-valore"
          />
        </label>
      </ActionForm>
    </section>
  );
}
