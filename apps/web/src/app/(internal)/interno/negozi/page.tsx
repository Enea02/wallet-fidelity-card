import { cardColors } from "@loyalty/shared/theme";
import Link from "next/link";
import { shopsOverview } from "@/lib/support/overview";
import {
  activityLabel,
  describeIssue,
  filterShops,
  num,
  parseShopQuery,
  programBadges,
  PROGRAM_FILTERS,
  PROGRAM_LABEL,
  shopState,
  SORT_LABEL,
  SORTS,
  STATUS_FILTERS,
  STATUS_LABEL,
  initials,
  type IssueKind,
  type ShopCard,
  type ShopQuery,
} from "@/lib/support/overview-view";
import { supportPage } from "@/lib/support/run";
import { Spark, trendLabel } from "../_ui/charts";
import { FilterForm } from "../_ui/FilterForm";
import { dateTime } from "../_ui/format";
import { Icon, type IconName } from "../_ui/icons";

const PAGE = 12;
const BAND_ICON: Record<IssueKind, IconName> = {
  sync: "alert",
  ticket: "chat",
  invito: "mail",
  inattivo: "clock",
  diagnostica: "pulse",
  sospeso: "pause",
};
const BAND_CLASS = { err: "int-band int-band-err", warn: "int-band int-band-warn", neutral: "int-band" } as const;
const STATE_CLASS = { attivo: "int-badge int-badge-ok", sospeso: "int-badge int-badge-err", "da avviare": "int-badge" };

type Params = { q?: string; stato?: string; programma?: string; ordina?: string; vista?: string; mostra?: string };

function ShopCardView({ s, now }: { s: ShopCard; now: Date }) {
  const off = s.status === "suspended";
  const colors = cardColors(s.hex_color);
  const mono = off ? { background: "var(--lw-ink-3)", color: "#fff" } : { background: colors.bg, color: colors.fg };
  const first = s.issues[0];
  const band = first ? describeIssue(first, now) : null;
  const state = shopState(s);
  const pending = s.issues.some((i) => i.kind === "invito");
  const page = `/interno/negozi/${s.id}`;
  const what = activityLabel(s);
  return (
    <article className={off ? "int-shop int-shop-off" : "int-shop"} data-testid={`negozio-${s.slug}`}>
      {band && first && (
        <div className={BAND_CLASS[band.tone]}>
          <Icon name={BAND_ICON[first.kind]} size={16} width={2} />
          {band.band}
        </div>
      )}
      <div className="int-shop-body">
        <div className="int-shop-id">
          <div className="int-mono" style={mono} aria-hidden="true">
            {initials(s.name)}
          </div>
          <div>
            <Link href={page} className="int-shop-name">
              {s.name}
            </Link>
            <div style={{ marginTop: 2 }}>
              <span className="int-code">/{s.slug}</span>
            </div>
          </div>
          <span className={STATE_CLASS[state]}>{state}</span>
        </div>
        <div className="int-tags">
          {programBadges(s).map((b) => (
            <span key={b} className="int-badge">
              {b}
            </span>
          ))}
        </div>
        <div className="int-stats">
          <div>
            <small>Clienti</small>
            <strong>{num(s.customers)}</strong>
          </div>
          <div>
            <small>Nuovi 7 gg</small>
            <strong>{off ? "—" : s.customers_new_7 > 0 ? `+${num(s.customers_new_7)}` : "0"}</strong>
          </div>
          <div>
            <small>{what} 7 gg</small>
            <strong>{off ? "—" : num(s.activity_7)}</strong>
          </div>
        </div>
        {off ? (
          <div className="int-spark-note">Carte disattivate su Google · app e iscrizioni bloccate</div>
        ) : pending && s.spark.every((v) => v === 0) ? (
          <div className="int-spark-note">Nessuna attività: il titolare non ha ancora fatto l&apos;accesso</div>
        ) : (
          <Spark values={s.spark} color={colors.bg} label={trendLabel(s.spark, what)} />
        )}
        <div className="int-shop-foot">
          {off ? (
            <Link href={`${page}#stato`} className="int-btn int-ghost int-btn-sm">
              Riattiva…
            </Link>
          ) : (
            <span>
              {s.staff} staff{s.owner ? ` · titolare: ${s.owner}` : ""}
            </span>
          )}
          <Link href={page} className="int-link">
            Apri scheda →
          </Link>
        </div>
      </div>
    </article>
  );
}

function ShopTable({ shops }: { shops: ShopCard[] }) {
  return (
    <div className="int-panel int-scroll">
      <table>
        <thead>
          <tr>
            <th>Negozio</th>
            <th>Indirizzo</th>
            <th>Stato</th>
            <th>Programma</th>
            <th>Clienti</th>
            <th>Attività 7 gg</th>
            <th>Staff</th>
            <th>Creato</th>
          </tr>
        </thead>
        <tbody>
          {shops.map((s) => {
            const state = shopState(s);
            return (
              <tr key={s.id} data-testid={`negozio-${s.slug}`}>
                <td>
                  <Link href={`/interno/negozi/${s.id}`}>{s.name}</Link>
                </td>
                <td className="int-code">/{s.slug}</td>
                <td>
                  <span className={STATE_CLASS[state]}>{state}</span>
                </td>
                <td className="int-muted">{programBadges(s)[0]}</td>
                <td>{num(s.customers)}</td>
                <td>{num(s.activity_7)}</td>
                <td>{s.staff}</td>
                <td className="int-muted">{dateTime(s.created_at)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default async function Negozi({ searchParams }: { searchParams: Promise<Params> }) {
  const sp = await searchParams;
  const query = parseShopQuery(sp);
  const table = sp.vista === "tabella";
  const shown = Math.max(PAGE, Number(sp.mostra) || PAGE);
  return supportPage("/interno/negozi", async () => {
    const all = await shopsOverview();
    const { shops, counts } = filterShops(all, query);
    const visible = shops.slice(0, shown);
    const customers = all.reduce((n, s) => n + s.customers, 0);
    const now = new Date();
    const link = (patch: Partial<ShopQuery & { vista: string; mostra: string }>) => {
      const next = { ...query, vista: table ? "tabella" : "card", mostra: "", ...patch };
      const p = new URLSearchParams();
      if (next.q) p.set("q", next.q);
      if (next.stato !== "tutti") p.set("stato", next.stato);
      if (next.programma !== "tutti") p.set("programma", next.programma);
      if (next.ordina !== "problemi") p.set("ordina", next.ordina);
      if (next.vista === "tabella") p.set("vista", "tabella");
      if (next.mostra) p.set("mostra", next.mostra);
      const s = p.toString();
      return s ? `/interno/negozi?${s}` : "/interno/negozi";
    };

    return (
      <>
        <div className="int-head">
          <div>
            <h1>Negozi</h1>
            <p className="int-sub" data-testid="negozi-conteggio">
              {all.length === 1 ? "1 negozio" : `${num(all.length)} negozi`} · {num(customers)} clienti iscritti · dati
              degli ultimi 7 giorni
            </p>
          </div>
          <div className="int-actions">
            <Link href="/interno/negozi/nuovo" className="int-btn" data-testid="nuovo-negozio">
              <Icon name="plus" size={16} width={2} />
              Nuovo negozio
            </Link>
          </div>
        </div>

        <div className="int-filters">
          <FilterForm className="int-row">
            <div className="int-find">
              <Icon name="search" />
              <label htmlFor="cerca-negozio" className="int-sr">
                Cerca negozio
              </label>
              <input
                id="cerca-negozio"
                name="q"
                defaultValue={query.q}
                placeholder="Nome, indirizzo /slug, email del titolare, P. IVA"
                data-testid="cerca-negozio"
              />
            </div>
            <label>
              Programma
              <select name="programma" defaultValue={query.programma}>
                {PROGRAM_FILTERS.map((f) => (
                  <option key={f} value={f}>
                    {PROGRAM_LABEL[f]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Ordina
              <select name="ordina" defaultValue={query.ordina}>
                {SORTS.map((f) => (
                  <option key={f} value={f}>
                    {SORT_LABEL[f]}
                  </option>
                ))}
              </select>
            </label>
            {query.stato !== "tutti" && <input type="hidden" name="stato" value={query.stato} />}
            {table && <input type="hidden" name="vista" value="tabella" />}
            <noscript>
              <button className="int-btn int-ghost">Applica</button>
            </noscript>
            <nav className="int-seg" aria-label="Vista">
              <Link href={link({ vista: "card" })} aria-current={!table ? "true" : undefined}>
                Card
              </Link>
              <Link href={link({ vista: "tabella" })} aria-current={table ? "true" : undefined}>
                Tabella
              </Link>
            </nav>
          </FilterForm>
          <nav className="int-chips" aria-label="Filtra per stato">
            {STATUS_FILTERS.map((f) => (
              <Link
                key={f}
                href={link({ stato: f })}
                className="int-chip"
                aria-current={query.stato === f ? "true" : undefined}
                data-testid={`stato-${f}`}
              >
                {f === "problemi" && <span className="int-dot int-dot-err" style={{ opacity: 1 }} />}
                {STATUS_LABEL[f]} <span>{num(counts[f])}</span>
              </Link>
            ))}
          </nav>
        </div>

        {visible.length === 0 ? (
          <p className="int-empty">Nessun negozio con questi filtri.</p>
        ) : table ? (
          <ShopTable shops={visible} />
        ) : (
          <section className="int-cards" aria-label="Elenco negozi">
            {visible.map((s) => (
              <ShopCardView key={s.id} s={s} now={now} />
            ))}
          </section>
        )}
        {shops.length > 0 && (
          <p className="int-more">
            {num(visible.length)} di {num(shops.length)}
            {shops.length > visible.length && (
              <>
                {" · "}
                <Link href={link({ mostra: String(shown + PAGE) })} className="int-link">
                  Mostra altri
                </Link>
              </>
            )}
          </p>
        )}
      </>
    );
  });
}
