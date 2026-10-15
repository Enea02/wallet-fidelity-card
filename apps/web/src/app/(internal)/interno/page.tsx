import Link from "next/link";
import { redirect } from "next/navigation";
import { supportPage } from "@/lib/support/run";
import { search } from "@/lib/support/search";

const KIND_HINT =
  "Codice assistenza (ERR-7K3QX), ticket (DIAG-…), codice errore (E_STAMP_COOLDOWN), codice carta, telefono, email dello staff o nome del negozio.";

export default async function Assistenza({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const query = q?.trim() ?? "";
  return supportPage("/interno", async (user) => {
    const result = query ? await search(query, user) : null;
    if (result?.redirect) redirect(result.redirect);
    return (
      <>
        <div>
          <h1>Assistenza</h1>
          <p className="int-sub">{KIND_HINT}</p>
        </div>
        <form className="int-search" role="search">
          <input
            name="q"
            defaultValue={query}
            autoFocus
            placeholder="ERR-7K3QX, DIAG-…, codice carta, telefono, email, negozio"
            aria-label="Cerca"
            data-testid="cerca"
          />
          <button className="int-btn" data-testid="cerca-invia">
            Cerca
          </button>
        </form>
        {result && (
          <section className="int-card" data-testid="risultati">
            <h2>
              {result.hits.length === 0
                ? `Nessun risultato (${result.kind})`
                : `${result.hits.length === 1 ? "1 risultato" : `${result.hits.length} risultati`} · ${result.kind}`}
            </h2>
            {result.explanation && (
              <div className="int-err" style={{ margin: "0 0 12px" }} data-testid="errore-catalogo">
                <div>
                  <strong>{result.explanation.code}</strong> · {result.explanation.description}
                </div>
                <div>
                  <strong>Causa probabile:</strong> {result.explanation.probableCause}
                </div>
                <div data-testid="errore-azione">
                  <strong>Cosa fare:</strong> {result.explanation.action}
                </div>
              </div>
            )}
            {result.hits.length === 0 && result.kind === "codice errore" && (
              <p className="int-muted">
                Nessuna richiesta con questo codice negli ultimi 30 giorni. Se l&apos;app non è riuscita a raggiungere
                il server (rete assente), il codice si trova solo nei pacchetti di diagnostica: chiedere
                all&apos;esercente «Profilo → Invia diagnostica all&apos;assistenza» e cercare il ticket DIAG-….
              </p>
            )}
            <table>
              <tbody>
                {result.hits.map((h) => (
                  <tr key={h.href}>
                    <td>
                      <Link href={h.href}>{h.title}</Link>
                    </td>
                    <td className="int-muted">{h.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </>
    );
  });
}
