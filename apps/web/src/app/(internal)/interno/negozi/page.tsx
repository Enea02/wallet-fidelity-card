import Link from "next/link";
import { supportPage } from "@/lib/support/run";
import { listShops } from "@/lib/support/shops";
import { dateTime } from "../_ui/format";

export default async function Negozi({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  return supportPage("/interno/negozi", async () => {
    const shops = await listShops(q?.trim() || undefined);
    return (
      <>
        <div className="int-row" style={{ justifyContent: "space-between" }}>
          <div>
            <h1>Negozi</h1>
            <p className="int-sub">{shops.length === 1 ? "1 negozio" : `${shops.length} negozi`}</p>
          </div>
          <Link href="/interno/negozi/nuovo" className="int-btn" data-testid="nuovo-negozio">
            Nuovo negozio
          </Link>
        </div>
        <form className="int-search">
          <input name="q" defaultValue={q ?? ""} placeholder="Cerca per nome o indirizzo" aria-label="Cerca negozio" />
          <button className="int-btn int-ghost">Cerca</button>
        </form>
        <div className="int-card">
          <table>
            <thead>
              <tr>
                <th>Negozio</th>
                <th>Indirizzo</th>
                <th>Stato</th>
                <th>Clienti</th>
                <th>Staff</th>
                <th>Creato</th>
              </tr>
            </thead>
            <tbody>
              {shops.map((s) => (
                <tr key={s.id} data-testid={`negozio-${s.slug}`}>
                  <td>
                    <Link href={`/interno/negozi/${s.id}`}>{s.name}</Link>
                  </td>
                  <td className="int-code">/{s.slug}</td>
                  <td>
                    <span className={s.status === "active" ? "int-badge int-badge-ok" : "int-badge int-badge-err"}>
                      {s.status === "active" ? "attivo" : "sospeso"}
                    </span>
                  </td>
                  <td>{s.customers}</td>
                  <td>{s.staff}</td>
                  <td className="int-muted">{dateTime(s.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>
    );
  });
}
