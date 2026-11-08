import { redirect } from "next/navigation";
import { currentAccess, finishLogin } from "@/lib/access";
import { loginPage } from "@/lib/support/run";
import { ActionForm } from "../../interno/_ui/ActionForm";
import { codeAction } from "../actions";
import { carryOf, carryQuery, CarryFields, type AccessParams } from "../params";

/** Secondo fattore del team interno: codice a 6 cifre dell'app di autenticazione. */
export default async function Codice({ searchParams }: { searchParams: Promise<AccessParams> }) {
  const carry = carryOf(await searchParams);
  const target = await loginPage("/accesso/codice", async () => {
    const now = await currentAccess();
    if (now.state === "nessuna") return `/accesso${carryQuery(carry)}`;
    if (now.state === "pronta") return finishLogin(now.userId, now.access, carry.dest, carry.ritorno);
    return null;
  });
  if (target) redirect(target);
  return (
    <section className="int-card int-narrow">
      <h1>Codice di verifica</h1>
      <p className="int-sub">Apri l&apos;app di autenticazione e scrivi il codice a 6 cifre di «Loyalty Wallet».</p>
      <ActionForm action={codeAction} submit="Entra" testId="codice">
        <CarryFields carry={carry} />
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
