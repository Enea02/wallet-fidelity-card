import { ActionForm } from "../_ui/ActionForm";
import { passwordAction } from "./actions";

export default async function Accesso({ searchParams }: { searchParams: Promise<{ errore?: string }> }) {
  const { errore } = await searchParams;
  return (
    <section className="int-card int-narrow">
      <h1>Accesso</h1>
      <p className="int-sub">Pannello interno: solo per il team di Loyalty Wallet.</p>
      {errore === "team" && (
        <p className="int-notice int-notice-error" role="alert">
          Questo account non fa parte del team interno.
        </p>
      )}
      <ActionForm action={passwordAction} submit="Continua" testId="accesso">
        <label>
          Email
          <input name="email" type="email" autoComplete="username" required data-testid="accesso-email" />
        </label>
        <label>
          Password
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
            data-testid="accesso-password"
          />
        </label>
      </ActionForm>
    </section>
  );
}
