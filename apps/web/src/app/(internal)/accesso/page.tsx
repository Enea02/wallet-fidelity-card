import Link from "next/link";
import { redirect } from "next/navigation";
import { currentAccess, finishLogin } from "@/lib/access";
import { loginPage } from "@/lib/support/run";
import { ActionForm } from "../interno/_ui/ActionForm";
import { passwordAction } from "./actions";
import { carryOf, carryQuery, CarryFields, type AccessParams } from "./params";

const ERRORS: Record<string, string> = {
  team: "Questo account non fa parte del team interno: il pannello non è disponibile.",
  sessione: "La sessione è scaduta. Accedi di nuovo.",
};

/**
 * Login unico: staff dei negozi (web app esercente) e team interno (pannello, con il codice
 * dell'app di autenticazione). Chi ha già una sessione valida va subito a destinazione.
 */
export default async function Accesso({ searchParams }: { searchParams: Promise<AccessParams> }) {
  const params = await searchParams;
  const carry = carryOf(params);
  const target = await loginPage("/accesso", async () => {
    if (params.errore) return null;
    const now = await currentAccess();
    if (now.state === "codice") return `/accesso/codice${carryQuery(carry)}`;
    if (now.state === "pronta") return finishLogin(now.userId, now.access, carry.dest, carry.ritorno);
    return null;
  });
  if (target) redirect(target);

  const error = params.errore ? ERRORS[params.errore] : undefined;
  return (
    <section className="int-card int-narrow">
      <h1>Accedi</h1>
      <p className="int-sub">
        {carry.dest === "interno"
          ? "Pannello interno: solo per il team di Loyalty Wallet."
          : "Usa l'email con cui il titolare ti ha invitato."}
      </p>
      {error && (
        <p className="int-notice int-notice-error" role="alert">
          {error}
        </p>
      )}
      <ActionForm action={passwordAction} submit="Accedi" testId="accesso">
        <CarryFields carry={carry} />
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
      <p className="int-muted">
        <Link href="/app/password-dimenticata">Password dimenticata?</Link>
      </p>
    </section>
  );
}
