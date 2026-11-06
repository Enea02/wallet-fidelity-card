import { redirect } from "next/navigation";
import { currentAccess } from "@/lib/access";
import { loginPage } from "@/lib/support/run";
import { ActionForm } from "../../interno/_ui/ActionForm";
import { chooseAction } from "../actions";
import { carryOf, carryQuery, type AccessParams } from "../params";

/** Chi è sia nel team sia nello staff di un negozio sceglie dove entrare. */
export default async function Scegli({ searchParams }: { searchParams: Promise<AccessParams> }) {
  const carry = carryOf(await searchParams);
  const shops = await loginPage("/accesso/scegli", async () => {
    const now = await currentAccess();
    return now.state === "pronta" && now.access.team && now.access.shops > 0 ? now.access.shops : null;
  });
  if (shops === null) redirect(`/accesso${carryQuery(carry)}`);
  return (
    <section className="int-narrow int-choice">
      <h1>Dove vuoi entrare?</h1>
      <p className="int-sub">Il tuo account ha accesso sia al pannello interno sia all&apos;app del negozio.</p>
      <div className="int-card">
        <h2>Pannello interno</h2>
        <p className="int-muted">Negozi della rete, assistenza, diagnostica.</p>
        <ActionForm action={chooseAction} submit="Apri il pannello" testId="scegli-interno">
          <input type="hidden" name="dest" value="interno" />
        </ActionForm>
      </div>
      <div className="int-card">
        <h2>Il mio negozio</h2>
        <p className="int-muted">
          App esercente: scanner, clienti e carta {shops === 1 ? "del tuo negozio" : `dei tuoi ${shops} negozi`}.
        </p>
        <ActionForm action={chooseAction} submit="Apri l'app" testId="scegli-app">
          <input type="hidden" name="dest" value="app" />
          {carry.ritorno && <input type="hidden" name="ritorno" value={carry.ritorno} />}
        </ActionForm>
      </div>
    </section>
  );
}
