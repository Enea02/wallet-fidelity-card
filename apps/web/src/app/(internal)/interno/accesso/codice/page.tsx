import { ActionForm } from "../../_ui/ActionForm";
import { codeAction } from "../actions";

export default function Codice() {
  return (
    <section className="int-card int-narrow">
      <h1>Codice di verifica</h1>
      <p className="int-sub">Apri l&apos;app di autenticazione e scrivi il codice a 6 cifre di «Loyalty Wallet».</p>
      <ActionForm action={codeAction} submit="Entra" testId="codice">
        <label>
          Codice
          <input
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9 ]{6,7}"
            maxLength={7}
            required
            autoFocus
            data-testid="codice-valore"
          />
        </label>
      </ActionForm>
    </section>
  );
}
