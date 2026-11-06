import { auditLabel } from "@loyalty/shared/support/timeline";
import Link from "next/link";
import { redirect } from "next/navigation";
import { networkOverview, PERIODS, type Period } from "@/lib/support/overview";
import {
  deltaPercent,
  describeIssue,
  greeting,
  hourMinute,
  num,
  when,
  type NetworkOverview,
  type WatchItem,
} from "@/lib/support/overview-view";
import { supportPage } from "@/lib/support/run";
import { DayBars } from "./_ui/charts";
import { Icon } from "./_ui/icons";

const PERIOD_LABEL: Record<Period, string> = { 1: "Oggi", 7: "7 giorni", 30: "30 giorni" };
const PERIOD_TEXT: Record<Period, string> = {
  1: "nelle ultime 24 ore",
  7: "negli ultimi 7 giorni",
  30: "negli ultimi 30 giorni",
};
const PERIOD_SHORT: Record<Period, string> = { 1: "in 24 ore", 7: "in 7 giorni", 30: "in 30 giorni" };
const SERIES = {
  attivita: { label: "Timbri", key: "activity", what: "Timbri, punti e scali al giorno" },
  iscrizioni: { label: "Iscrizioni", key: "enrollments", what: "Nuovi clienti iscritti al giorno" },
  errori: { label: "Errori", key: "errors", what: "Righe di errore nei log al giorno" },
} as const;
type Serie = keyof typeof SERIES;

const BADGE = { err: "int-badge int-badge-err", warn: "int-badge int-badge-warn", neutral: "int-badge" } as const;

/** Dove porta "Apri" di una cosa da guardare. */
function watchHref(w: WatchItem): string {
  if (w.kind === "ticket" && typeof w.detail.ticket === "string") return `/interno/diagnostica/${w.detail.ticket}`;
  const anchor = w.kind === "sync" ? "#wallet" : w.kind === "diagnostica" ? "#diagnostica" : "";
  return `/interno/negozi/${w.shop_id}${anchor}`;
}

function actorLabel(c: NetworkOverview["changes"][number]): string {
  if (c.actor_type === "support") return `assistenza · ${c.actor_id ?? "team"}`;
  if (c.actor_type === "staff") return c.actor_name ?? "staff";
  if (c.actor_type === "customer") return "cliente";
  return "sistema";
}

export default async function Panoramica({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; periodo?: string; serie?: string }>;
}) {
  const sp = await searchParams;
  // vecchi link alla ricerca (/interno?q=…): ora la ricerca è nella vista Assistenza
  if (sp.q?.trim()) redirect(`/interno/assistenza?q=${encodeURIComponent(sp.q.trim())}`);
  const period = (PERIODS.find((p) => String(p) === sp.periodo) ?? 7) as Period;
  const serie: Serie = sp.serie && sp.serie in SERIES ? (sp.serie as Serie) : "attivita";

  return supportPage("/interno", async (user) => {
    const o = await networkOverview(period);
    const now = new Date();
    const href = (p: Period, s: Serie) =>
      `/interno?${new URLSearchParams({ ...(p !== 7 && { periodo: String(p) }), ...(s !== "attivita" && { serie: s }) })}`;

    const delta = deltaPercent(o.activity, o.activity_prev);
    const enrollPct = o.enroll_started > 0 ? Math.round((o.enroll_verified / o.enroll_started) * 100) : null;
    const otherErrors = o.errors_24h - (o.errors_top[0]?.count ?? 0);
    const s = o.services;
    const googleBad = s.google_failed > 0;
    const smsBad = s.sms_failed > 0;
    const queueBad = s.queue_exhausted > 0;
    const top = o.top_shops[0]?.count ?? 0;
    const watch = o.watch.slice(0, 8);
    const series = SERIES[serie];

    return (
      <>
        <div className="int-topbar">
          <form className="int-find" role="search" action="/interno/assistenza">
            <Icon name="search" />
            <label htmlFor="cerca-globale" className="int-sr">
              Cerca
            </label>
            <input
              id="cerca-globale"
              name="q"
              placeholder="ERR-7K3QX, DIAG-…, codice carta, telefono, email staff, negozio"
              data-testid="cerca-globale"
            />
            <span className="int-code">invio</span>
          </form>
          <nav className="int-seg" aria-label="Periodo">
            {PERIODS.map((p) => (
              <Link key={p} href={href(p, serie)} aria-current={p === period ? "true" : undefined}>
                {PERIOD_LABEL[p]}
              </Link>
            ))}
          </nav>
        </div>

        <div className="int-head">
          <div>
            <h1 data-testid="panoramica-titolo">
              {greeting(now)}, {user.name}
            </h1>
            <p className="int-sub">
              Situazione della rete {PERIOD_TEXT[period]} · aggiornato alle {hourMinute(now.toISOString())}
            </p>
          </div>
          <Link href="/interno/negozi/nuovo" className="int-btn">
            <Icon name="plus" size={16} width={2} />
            Nuovo negozio
          </Link>
        </div>

        <section className="int-kpis" aria-label="Indicatori" data-testid="panoramica-indicatori">
          <div className="int-kpi">
            <span>Negozi attivi</span>
            <strong>{num(o.shops_active)}</strong>
            <span>
              {o.shops_new_30 > 0 && <b className="int-up">+{num(o.shops_new_30)}</b>}
              {o.shops_new_30 > 0 ? " nel mese · " : "nessuno nuovo nel mese · "}
              {o.shops_suspended === 1 ? "1 sospeso" : `${num(o.shops_suspended)} sospesi`}
            </span>
          </div>
          <div className="int-kpi">
            <span>Clienti iscritti</span>
            <strong>{num(o.customers)}</strong>
            <span>
              <b className="int-up">+{num(o.customers_new)}</b> {PERIOD_SHORT[period]}
            </span>
          </div>
          <div className="int-kpi">
            <span>Timbri e punti dati</span>
            <strong>{num(o.activity)}</strong>
            <span>
              {delta ? (
                <>
                  <b className={delta.startsWith("-") ? "int-down" : "int-up"}>{delta}</b> sul periodo prima
                </>
              ) : (
                "nessun confronto con il periodo prima"
              )}
            </span>
          </div>
          <div className="int-kpi">
            <span>Iscrizioni completate</span>
            <strong>{enrollPct === null ? "—" : `${enrollPct}%`}</strong>
            <span>
              {o.enroll_started > 0
                ? `${num(o.enroll_verified)} su ${num(o.enroll_started)} avviate (OTP)`
                : "nessuna iscrizione avviata"}
            </span>
          </div>
          <div className={o.errors_24h > 0 ? "int-kpi int-kpi-err" : "int-kpi"}>
            <span>Errori ultime 24 h</span>
            <strong>{num(o.errors_24h)}</strong>
            <span>
              {o.errors_top[0]
                ? `${o.errors_top[0].count} × ${o.errors_top[0].code}${otherErrors > 0 ? ` · ${otherErrors} altri` : ""}`
                : "nessun errore"}
            </span>
          </div>
          <div className={o.unsynced_cards > 0 ? "int-kpi int-kpi-warn" : "int-kpi"}>
            <span>Carte non sincronizzate</span>
            <strong>{num(o.unsynced_cards)}</strong>
            <span>
              {o.unsynced_cards === 0
                ? "tutte allineate con Google"
                : o.unsynced_shops.length === 1
                  ? `tutte in ${o.unsynced_shops[0]}`
                  : `in ${o.unsynced_shops.length} negozi`}
            </span>
          </div>
        </section>

        <div className="int-cols">
          <section className="int-panel" data-testid="da-guardare">
            <div className="int-panel-head">
              <h2>Da guardare adesso</h2>
              <span className="int-badge">
                {o.watch.length === 1 ? "1 elemento" : `${num(o.watch.length)} elementi`}
              </span>
            </div>
            {watch.length === 0 ? (
              <p className="int-empty">Niente da guardare: nessun errore, ticket o negozio fermo.</p>
            ) : (
              <ul className="int-list int-watch">
                {watch.map((w) => {
                  const v = describeIssue(w, now);
                  return (
                    <li key={`${w.shop_id}-${w.kind}`}>
                      <span className={BADGE[v.tone]}>{v.label}</span>
                      <div>
                        <strong>{w.shop_name}</strong>
                        <div className="int-muted">{v.text}</div>
                      </div>
                      <Link href={watchHref(w)} className="int-btn int-ghost int-btn-sm">
                        Apri
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
            {o.watch.length > watch.length && (
              <Link href="/interno/negozi?ordina=problemi" className="int-link">
                Altri {o.watch.length - watch.length} nell&apos;elenco dei negozi →
              </Link>
            )}
          </section>

          <section className="int-panel">
            <div className="int-panel-head">
              <h2>Servizi esterni</h2>
            </div>
            <ul className="int-list">
              <li>
                <span className={googleBad ? "int-dot int-dot-err" : "int-dot"} />
                <div>
                  <strong>Google Wallet API</strong>
                  <div className="int-muted">
                    {num(s.google_failed)} errori su {num(s.google_calls)} chiamate · 24 h
                  </div>
                </div>
                <span className={googleBad ? "int-badge int-badge-err" : "int-badge int-badge-ok"}>
                  {googleBad ? "degradato" : "ok"}
                </span>
              </li>
              <li>
                <span className={smsBad ? "int-dot int-dot-warn" : "int-dot"} />
                <div>
                  <strong>SMS OTP</strong>
                  <div className="int-muted">
                    {num(s.sms_sent)} inviati{smsBad ? ` · ${num(s.sms_failed)} non partiti` : ""} ·{" "}
                    {s.blocked_numbers === 1 ? "1 numero bloccato" : `${num(s.blocked_numbers)} numeri bloccati`}
                  </div>
                </div>
                <span className={smsBad ? "int-badge int-badge-warn" : "int-badge int-badge-ok"}>
                  {smsBad ? "errori" : "ok"}
                </span>
              </li>
              <li>
                <span className={queueBad ? "int-dot int-dot-warn" : "int-dot"} />
                <div>
                  <strong>Coda sincronizzazione</strong>
                  <div className="int-muted">
                    {num(s.queue_pending)} in attesa
                    {queueBad ? ` · ${num(s.queue_exhausted)} ritentativi esauriti` : ""}
                    {s.cron_last_at ? ` · ultimo giro ${when(s.cron_last_at, now)}` : ""}
                  </div>
                </div>
                <span className={queueBad ? "int-badge int-badge-warn" : "int-badge int-badge-ok"}>
                  {queueBad ? "da guardare" : "ok"}
                </span>
              </li>
            </ul>
          </section>
        </div>

        <div className="int-cols">
          <section className="int-panel">
            <div className="int-panel-head">
              <div>
                <h2>Attività della rete</h2>
                <p>{series.what}, ultimi 30 giorni</p>
              </div>
              <nav className="int-seg" aria-label="Serie">
                {(Object.keys(SERIES) as Serie[]).map((k) => (
                  <Link key={k} href={href(period, k)} aria-current={k === serie ? "true" : undefined}>
                    {SERIES[k].label}
                  </Link>
                ))}
              </nav>
            </div>
            <DayBars
              days={o.series.map((d) => d.day)}
              values={o.series.map((d) => d[series.key])}
              label={`${series.what} negli ultimi 30 giorni; oggi ${num(o.series.at(-1)?.[series.key] ?? 0)}`}
              color={serie === "errori" ? "var(--lw-danger)" : undefined}
            />
          </section>

          <section className="int-panel">
            <div className="int-panel-head">
              <h2>Negozi più attivi</h2>
              <span className="int-muted" style={{ fontSize: 13 }}>
                attività, {PERIOD_LABEL[period].toLowerCase()}
              </span>
            </div>
            {o.top_shops.length === 0 ? (
              <p className="int-empty">Nessuna attività nel periodo.</p>
            ) : (
              <ol className="int-rank">
                {o.top_shops.map((t) => (
                  <li key={t.shop_id}>
                    <div>
                      <Link href={`/interno/negozi/${t.shop_id}`}>{t.name}</Link>
                      <span>{num(t.count)}</span>
                    </div>
                    <div className="int-track">
                      <div style={{ width: `${Math.max(4, Math.round((t.count / top) * 100))}%` }} />
                    </div>
                  </li>
                ))}
              </ol>
            )}
            <p style={{ margin: "16px 0 0" }}>
              <Link href="/interno/negozi" className="int-link">
                Tutti i negozi →
              </Link>
            </p>
          </section>
        </div>

        <section className="int-panel">
          <div className="int-panel-head">
            <h2>Ultime modifiche</h2>
            <span className="int-muted" style={{ fontSize: 13 }}>
              dallo storico (audit_log)
            </span>
          </div>
          {o.changes.length === 0 ? (
            <p className="int-empty">Nessuna modifica registrata.</p>
          ) : (
            <div className="int-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Quando</th>
                    <th>Chi</th>
                    <th>Cosa</th>
                    <th>Negozio</th>
                  </tr>
                </thead>
                <tbody>
                  {o.changes.map((c, i) => (
                    <tr key={`${c.ts}-${i}`}>
                      <td className="int-muted" style={{ whiteSpace: "nowrap" }}>
                        {when(c.ts, now)}
                      </td>
                      <td>
                        <span className="int-badge">{actorLabel(c)}</span>
                      </td>
                      <td>
                        {auditLabel(c.action).replace(/^./, (x) => x.toUpperCase())}
                        {c.reason ? ` · «${c.reason}»` : ""}
                      </td>
                      <td>{c.shop_id ? <Link href={`/interno/negozi/${c.shop_id}`}>{c.shop_name}</Link> : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </>
    );
  });
}
