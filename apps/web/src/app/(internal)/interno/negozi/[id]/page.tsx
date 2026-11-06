import { cardColors, STAMP_ICONS, strip, svgDataUrl, type StampIcon } from "@loyalty/shared/theme";
import Link from "next/link";
import { notFound } from "next/navigation";
import { log } from "@/lib/observability/logger";
import { openModesFor } from "@/lib/support/diagnostics";
import { shopOverview } from "@/lib/support/overview";
import {
  deltaPercent,
  describeIssue,
  hourMinute,
  initials,
  num,
  shortDay,
  when,
  type ShopOverview,
} from "@/lib/support/overview-view";
import { supportPage } from "@/lib/support/run";
import { shopDetail, type StaffRow } from "@/lib/support/shops";
import { loadTimeline } from "@/lib/support/timeline";
import type { Shop } from "@/lib/types";
import { ActionForm } from "../../_ui/ActionForm";
import { DayBars } from "../../_ui/charts";
import { DiagnosticPanel } from "../../_ui/DiagnosticPanel";
import { UUID_RE } from "../../_ui/format";
import { Icon, type IconName } from "../../_ui/icons";
import { Timeline } from "../../_ui/Timeline";
import { resyncShopAction, shopLegalAction, shopStatusAction } from "../actions";

type Check = {
  tone: "ok" | "err" | "warn" | "off";
  title: string;
  text: string;
  action?: { href: string; label: string } | undefined;
};
const CHECK_ICON: Record<Check["tone"], IconName> = { ok: "check", err: "cross", warn: "bang", off: "dash" };
const CHECK_CLASS: Record<Check["tone"], string> = {
  ok: "int-ico int-ico-ok",
  err: "int-ico int-ico-err",
  warn: "int-ico int-ico-warn",
  off: "int-ico",
};

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : null);

function healthChecks(shop: Shop, o: ShopOverview, staff: StaffRow[], modeOpen: string | null): Check[] {
  const g = o.google;
  const googleBad = g.failing > 0 || g.class_failing > 0;
  const pendingStaff = staff.filter((m) => m.invite_pending);
  const missingLegal = [
    !shop.legal_name && "ragione sociale",
    !shop.vat_number && "partita IVA",
    !shop.privacy_email && "email privacy",
  ].filter(Boolean) as string[];
  const enrollPct = pct(o.enroll.verified_7, o.enroll.started_7);
  return [
    {
      tone: googleBad ? "err" : "ok",
      title: "Google Wallet",
      text:
        `Template v${g.card_version}${g.class_failing > 0 ? " non aggiornato" : " aggiornato"} · ` +
        `${num(g.synced)} carte su ${num(g.cards)} sincronizzate` +
        (g.failing > 0
          ? ` · ${num(g.failing)} in errore${g.last_error_at ? ` dalle ${hourMinute(g.last_error_at)}` : ""}`
          : "") +
        (googleBad && g.last_error_code ? ` · ${g.last_error_code}` : ""),
      action: googleBad ? { href: "#wallet", label: "Risincronizza" } : undefined,
    },
    {
      tone: o.enroll.blocked > 0 ? "warn" : "ok",
      title: "Iscrizioni",
      text:
        (o.enroll.started_7 > 0
          ? `${num(o.enroll.verified_7)} completate su ${num(o.enroll.started_7)} avviate in 7 giorni (${enrollPct}%)`
          : "Nessuna iscrizione avviata in 7 giorni") +
        ` · ${o.enroll.blocked === 0 ? "nessun numero bloccato" : o.enroll.blocked === 1 ? "1 numero bloccato" : `${o.enroll.blocked} numeri bloccati`}`,
    },
    {
      tone: pendingStaff.length > 0 ? "warn" : "ok",
      title: "Staff",
      text:
        pendingStaff.length === 0
          ? `${staff.length === 1 ? "1 persona" : `${staff.length} persone`}, tutti hanno fatto l'accesso`
          : `${pendingStaff.length === 1 ? "1 invito in attesa" : `${pendingStaff.length} inviti in attesa`} (${pendingStaff.map((m) => m.display_name).join(", ")})`,
      action: pendingStaff.length > 0 ? { href: "#staff", label: "Vedi" } : undefined,
    },
    {
      tone: missingLegal.length > 0 ? "warn" : "ok",
      title: "Dati per l'informativa",
      text:
        missingLegal.length === 0
          ? "Ragione sociale, partita IVA ed email privacy compilati"
          : `Mancano: ${missingLegal.join(", ")}`,
      action: missingLegal.length > 0 ? { href: "#dati-legali", label: "Compila" } : undefined,
    },
    {
      tone: "off",
      title: "Modalità diagnostica",
      text: modeOpen ?? "Non attiva",
      action: { href: "#diagnostica", label: modeOpen ? "Gestisci" : "Attiva…" },
    },
  ];
}

function CardPreview({ shop, sample }: { shop: Shop; sample: number }) {
  const c = cardColors(shop.hex_color);
  const icon = (shop.stamp_icon in STAMP_ICONS ? shop.stamp_icon : "check") as StampIcon;
  const n = shop.stamps_required;
  const svg = strip({
    n,
    filled: Math.min(sample, n - 1),
    w: 600,
    h: n <= 6 ? 120 : 220,
    fg: c.fg,
    ring: c.ring,
    bg: c.bg,
    icon,
    transparent: true,
  });
  return (
    <div className="int-pass" style={{ background: c.bg, color: c.fg }} aria-label="Anteprima della carta nel wallet">
      <div className="int-pass-head">
        <div className="int-mono" style={{ background: c.fg, color: c.bg }} aria-hidden="true">
          {initials(shop.name)}
        </div>
        <div>
          <strong style={{ fontSize: 15 }}>{shop.name}</strong>
          <span style={{ fontSize: 12, color: c.label }}>{shop.program_name}</span>
        </div>
      </div>
      {!shop.loyalty_enabled ? (
        <p style={{ margin: 0, fontSize: 14, color: c.label }}>Carta fedeltà spenta: il negozio usa solo tessere.</p>
      ) : shop.loyalty_mode === "punti" ? (
        <p style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>
          {shop.points_per_euro} pt ogni €
          <span style={{ display: "block", fontSize: 13, fontWeight: 500, color: c.label }}>
            {shop.points_levels.length > 0
              ? `Livelli: ${shop.points_levels.map((l) => l.name).join(" · ")}`
              : "Nessun livello"}
          </span>
        </p>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- SVG generato al momento, niente ottimizzazione
        <img src={svgDataUrl(svg)} alt="" />
      )}
      {shop.loyalty_enabled && shop.loyalty_mode === "timbri" && (
        <div className="int-pass-foot">
          <span style={{ color: c.label }}>PREMIO</span>
          <strong>{shop.reward_label}</strong>
        </div>
      )}
    </div>
  );
}

export default async function Negozio({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ creato?: string }>;
}) {
  const { id } = await params;
  const { creato } = await searchParams;
  if (!UUID_RE.test(id)) notFound();
  return supportPage(`/interno/negozi/${id}`, async (user) => {
    const { shop, staff, customers } = await shopDetail(id);
    const [o, { blocks, rows }, modes] = await Promise.all([
      shopOverview(shop.id),
      loadTimeline({ kind: "negozio", shopId: shop.id }),
      openModesFor("shop", shop.id),
    ]);
    log.event("support.timeline.viewed", {
      support_name: user.name,
      subject_kind: "negozio",
      subject: shop.name,
      rows,
    });
    const now = new Date();
    const suspended = shop.status === "suspended";
    const colors = cardColors(shop.hex_color);
    const sync = o.issues.find((i) => i.kind === "sync");
    const syncView = sync ? describeIssue(sync, now) : null;
    const mode = modes[0];
    const modeText = mode
      ? `Attiva «${mode.level}» fino alle ${when(mode.expires_at, now)} · attivata da ${mode.enabled_by}`
      : null;
    const timbri = shop.loyalty_enabled && shop.loyalty_mode === "timbri";
    const what = !shop.loyalty_enabled ? "Utilizzi" : shop.loyalty_mode === "punti" ? "Scontrini" : "Timbri dati";
    const delta = deltaPercent(o.activity_7, o.activity_prev_7);
    const returning = pct(o.returning_60, o.visitors_60);
    const wallet = o.google.failing + o.google.class_failing;
    const checks = healthChecks(shop, o, staff, modeText);
    const sample = Math.round(shop.stamps_required * 0.6);

    return (
      <>
        <div className="int-stripe" style={{ background: colors.bg }} />
        <nav aria-label="Percorso" className="int-crumbs">
          <Link href="/interno/negozi">Negozi</Link> / {shop.name}
        </nav>

        <div className="int-head" id="panoramica" style={{ alignItems: "center" }}>
          <div className="int-shop-head">
            <div className="int-mono" style={{ background: colors.bg, color: colors.fg }} aria-hidden="true">
              {initials(shop.name)}
            </div>
            <div style={{ minWidth: 0 }}>
              <h1 data-testid="negozio-titolo">{shop.name}</h1>
              <div className="int-meta">
                <span className="int-code">/{shop.slug}</span>
                <span
                  className={suspended ? "int-badge int-badge-err" : "int-badge int-badge-ok"}
                  data-testid="negozio-stato"
                >
                  {suspended ? "sospeso" : "attivo"}
                </span>
                <span className="int-badge">
                  {!shop.loyalty_enabled ? "Solo tessere" : shop.loyalty_mode === "punti" ? "Punti" : "Timbri"}
                </span>
                <span className="int-muted">{customers === 1 ? "1 cliente" : `${num(customers)} clienti`}</span>
                <a href={`/${shop.slug}`} target="_blank" rel="noreferrer" className="int-link">
                  Pagina di iscrizione <Icon name="external" size={14} width={2} />
                </a>
              </div>
            </div>
          </div>
          <div className="int-actions">
            <a href="#diagnostica" className="int-btn int-ghost">
              <Icon name="pulse" size={16} width={2} />
              Diagnostica
            </a>
            <a href="#wallet" className="int-btn">
              <Icon name="sync" size={16} width={2} />
              Risincronizza Wallet
            </a>
          </div>
        </div>

        {creato && (
          <p className="int-notice int-notice-ok" role="status">
            Negozio creato: il titolare ha ricevuto l&apos;invito (se non aveva già un account).
          </p>
        )}

        {sync && syncView && !suspended && (
          <div role="alert" className="int-alert" data-testid="negozio-avviso-wallet">
            <Icon name="alert" size={22} width={2} />
            <div>
              <strong>{syncView.text.split(" · ")[0]}</strong>
              <div style={{ fontSize: 14 }}>
                {o.google.last_error_at ? `Ultimo errore ${when(o.google.last_error_at, now)} · ` : ""}
                {o.google.last_error_code && <span className="int-code">{o.google.last_error_code}</span>}
                {" · i clienti vedono ancora il saldo precedente"}
              </div>
            </div>
            <a href="#timeline" className="int-btn int-ghost">
              Vedi nella timeline
            </a>
            <a href="#wallet" className="int-btn int-danger">
              {o.google.failing > 0
                ? `Risincronizza ${o.google.failing === 1 ? "la carta" : `le ${o.google.failing} carte`}`
                : "Risincronizza il negozio"}
            </a>
          </div>
        )}

        <nav className="int-tabs" aria-label="Sezioni del negozio">
          <a href="#panoramica">Panoramica</a>
          <a href="#clienti">
            Clienti <span>{num(customers)}</span>
          </a>
          <a href="#staff">
            Staff <span>{staff.length}</span>
          </a>
          <a href="#carta">Carta e programma</a>
          <a href="#wallet">Wallet {wallet > 0 && <span className="int-badge-err">{wallet}</span>}</a>
          <a href="#diagnostica">Diagnostica</a>
          <a href="#dati-legali">Dati legali</a>
          <a href="#timeline">Timeline</a>
        </nav>

        <section className="int-kpis" aria-label="Indicatori del negozio">
          <div className="int-kpi">
            <span>Clienti iscritti</span>
            <strong>{num(o.customers)}</strong>
            <span>
              <b className="int-up">+{num(o.customers_new_7)}</b> in 7 giorni
            </span>
          </div>
          <div className="int-kpi">
            <span>{what} · 7 gg</span>
            <strong>{num(o.activity_7)}</strong>
            <span>
              {delta ? (
                <>
                  <b className={delta.startsWith("-") ? "int-down" : "int-up"}>{delta}</b> sulla settimana prima
                </>
              ) : (
                "nessun confronto con la settimana prima"
              )}
            </span>
          </div>
          {timbri ? (
            <div className="int-kpi">
              <span>Premi riscattati · 30 gg</span>
              <strong>{num(o.redeems_30)}</strong>
              <span>«{shop.reward_label}»</span>
            </div>
          ) : (
            <div className="int-kpi">
              <span>Iscrizioni · 7 gg</span>
              <strong>{num(o.enroll.verified_7)}</strong>
              <span>su {num(o.enroll.started_7)} avviate</span>
            </div>
          )}
          <div className="int-kpi">
            <span>Clienti che tornano</span>
            <strong>{returning === null ? "—" : `${returning}%`}</strong>
            <span>con 2+ visite in 60 gg</span>
          </div>
        </section>

        <div className="int-cols">
          <section className="int-panel">
            <div className="int-panel-head">
              <div>
                <h2>{what} al giorno</h2>
                <p>Ultimi 30 giorni</p>
              </div>
              <div className="int-legend" style={{ "--int-bar": colors.bg } as React.CSSProperties}>
                <span>
                  <i className="int-soft" />
                  giorni
                </span>
                <span>
                  <i />
                  oggi
                </span>
              </div>
            </div>
            <DayBars
              days={o.series.map((d) => d.day)}
              values={o.series.map((d) => d.count)}
              color={colors.bg}
              label={`${what} al giorno negli ultimi 30 giorni; oggi ${num(o.series.at(-1)?.count ?? 0)}`}
            />
          </section>

          <section className="int-panel" id="carta" style={{ display: "grid", gap: 16 }}>
            <div className="int-panel-head" style={{ margin: 0 }}>
              <h2>La carta</h2>
              <span className="int-muted" style={{ fontSize: 13 }}>
                la modifica il titolare dall&apos;app
              </span>
            </div>
            <CardPreview shop={shop} sample={sample} />
            <dl>
              {timbri && (
                <>
                  <dt>Timbri per il premio</dt>
                  <dd>{shop.stamps_required}</dd>
                  <dt>Intervallo minimo</dt>
                  <dd>
                    {shop.stamp_cooldown_minutes === 0
                      ? "nessuno"
                      : `${shop.stamp_cooldown_minutes} min tra due timbri`}
                  </dd>
                  <dt>Unità</dt>
                  <dd>
                    {shop.stamp_unit} / {shop.stamp_unit_plural}
                  </dd>
                </>
              )}
              {shop.loyalty_enabled && shop.loyalty_mode === "punti" && (
                <>
                  <dt>Spesa minima</dt>
                  <dd>
                    {(shop.points_min_cents / 100).toLocaleString("it-IT", { style: "currency", currency: "EUR" })}
                  </dd>
                </>
              )}
              <dt>Versione carta</dt>
              <dd>v{shop.card_version}</dd>
            </dl>
          </section>
        </div>

        <div className="int-cols">
          <section className="int-panel">
            <h2>Stato di salute</h2>
            <p className="int-muted" style={{ margin: "2px 0 6px", fontSize: 14 }}>
              Controlli calcolati all&apos;apertura della pagina
            </p>
            <ul className="int-checks" data-testid="negozio-salute">
              {checks.map((c) => (
                <li key={c.title}>
                  <span className={CHECK_CLASS[c.tone]}>
                    <Icon name={CHECK_ICON[c.tone]} size={14} width={2.6} />
                  </span>
                  <div>
                    <strong>{c.title}</strong>
                    <div className="int-muted">{c.text}</div>
                  </div>
                  {c.action && (
                    <a href={c.action.href} className="int-btn int-ghost int-btn-sm">
                      {c.action.label}
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </section>

          <section className="int-panel" id="staff">
            <div className="int-panel-head" style={{ marginBottom: 6 }}>
              <h2>Staff</h2>
            </div>
            <ul className="int-list">
              {staff.map((m) => (
                <li key={m.user_id}>
                  <span className="int-person" aria-hidden="true">
                    {initials(m.display_name)}
                  </span>
                  <div>
                    <Link href={`/interno/utenti/${m.user_id}`} style={{ fontWeight: 600, textDecoration: "none" }}>
                      {m.display_name}
                    </Link>
                    <div className="int-muted" style={{ fontSize: 13 }}>
                      {m.role === "owner" ? "titolare" : "operatore"} · {m.email}
                      {!m.invite_pending && m.stamps_given > 0 ? ` · ${num(m.stamps_given)} timbri dati` : ""}
                    </div>
                  </div>
                  {m.invite_pending && <span className="int-badge int-badge-warn">invito in attesa</span>}
                </li>
              ))}
            </ul>
          </section>
        </div>

        <div className="int-cols">
          <section className="int-panel" id="clienti">
            <div className="int-panel-head">
              <h2>Ultimi clienti attivi</h2>
              <Link href="/interno/assistenza" className="int-link">
                Cerca un cliente →
              </Link>
            </div>
            {o.recent.length === 0 ? (
              <p className="int-empty">Nessun cliente ha ancora ricevuto timbri o punti.</p>
            ) : (
              <div className="int-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Carta</th>
                      <th>Cliente</th>
                      <th>Saldo</th>
                      <th>Ultima visita</th>
                      <th>Wallet</th>
                    </tr>
                  </thead>
                  <tbody>
                    {o.recent.map((c) => (
                      <tr key={c.id}>
                        <td>
                          <Link
                            href={`/interno/clienti/${c.id}`}
                            className="int-code"
                            style={{ textDecoration: "none" }}
                          >
                            {c.short_code}
                          </Link>
                        </td>
                        <td>{c.name}</td>
                        <td>
                          {shop.loyalty_mode === "punti"
                            ? `${num(c.points)} pt`
                            : `${c.stamps} / ${shop.stamps_required}${c.rewards > 0 ? ` · ${c.rewards === 1 ? "1 premio" : `${c.rewards} premi`}` : ""}`}
                        </td>
                        <td className="int-muted">{when(c.last_visit_at, now)}</td>
                        <td>
                          {c.wallet_error ? (
                            <span className="int-badge int-badge-err">non allineata</span>
                          ) : c.wallet_synced ? (
                            <span className="int-badge int-badge-ok">Google</span>
                          ) : (
                            <span className="int-badge">non salvata</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="int-panel">
            <div className="int-panel-head" style={{ marginBottom: 4 }}>
              <h2>Ultimi eventi</h2>
              <a href="#timeline" className="int-link">
                Tutti →
              </a>
            </div>
            {blocks.length === 0 ? (
              <p className="int-empty">Nessun evento negli ultimi 14 giorni.</p>
            ) : (
              <div className="int-mini-tl">
                {blocks.slice(0, 5).map((b, i) => (
                  <div key={`${b.ts}-${i}`}>
                    <time dateTime={b.ts}>{when(b.ts, now)}</time>
                    <span
                      className={
                        b.level === "error"
                          ? "int-badge int-badge-err"
                          : b.level === "warn"
                            ? "int-badge int-badge-warn"
                            : "int-badge"
                      }
                      style={{ padding: "0 7px", alignSelf: "flex-start" }}
                      aria-label={b.level === "error" ? "errore" : b.level === "warn" ? "avviso" : "informazione"}
                    >
                      {b.level === "error" ? "✕" : b.level === "warn" ? "!" : "·"}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>{b.title}</div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <div className="int-grid">
          <section className="int-card" id="wallet">
            <h2>Google Wallet</h2>
            <p className="int-muted">
              Rimanda a Google il template del negozio e lo stato completo di tutte le carte. Serve dopo un problema di
              credenziali o se molte carte risultano disallineate.
            </p>
            <ActionForm
              action={resyncShopAction}
              submit="Risincronizza tutto il negozio"
              testId="risincronizza-negozio"
            >
              <input type="hidden" name="shopId" value={shop.id} />
              <label>
                Motivo
                <input name="reason" placeholder="credenziali Google sostituite" />
              </label>
            </ActionForm>
          </section>

          <div id="diagnostica">
            <DiagnosticPanel scopeType="shop" scopeId={shop.id} open={modes} back={`/interno/negozi/${shop.id}`} />
          </div>

          <section className="int-card" id="dati-legali">
            <h2>Dati per l&apos;informativa</h2>
            <ActionForm action={shopLegalAction} submit="Salva" testId="informativa">
              <input type="hidden" name="shopId" value={shop.id} />
              <label>
                Ragione sociale
                <input name="legalName" defaultValue={shop.legal_name ?? ""} maxLength={120} />
              </label>
              <label>
                Partita IVA
                <input name="vatNumber" defaultValue={shop.vat_number ?? ""} maxLength={20} />
              </label>
              <label>
                Email privacy
                <input name="privacyEmail" type="email" defaultValue={shop.privacy_email ?? ""} />
              </label>
            </ActionForm>
          </section>
        </div>

        <section id="timeline">
          <h2>Timeline (14 giorni)</h2>
          <Timeline blocks={blocks} />
        </section>

        <section className="int-panel int-danger-zone" id="stato">
          <h2>{suspended ? "Riattiva il negozio" : "Sospendi il negozio"}</h2>
          <p className="int-muted" style={{ margin: "6px 0 14px", fontSize: 14 }}>
            {suspended
              ? `Sospeso${o.issues.find((i) => i.kind === "sospeso")?.since ? ` dal ${shortDay(o.issues.find((i) => i.kind === "sospeso")!.since!)}` : ""}. App esercente e pagina di iscrizione tornano disponibili; le carte tornano attive su Google entro qualche minuto.`
              : "Blocca app esercente e iscrizioni; le carte dei clienti vengono disattivate su Google entro qualche minuto. Si può riattivare in qualsiasi momento."}
          </p>
          <ActionForm
            action={shopStatusAction}
            submit={suspended ? "Riattiva" : "Sospendi"}
            danger={!suspended}
            confirm={suspended ? "Riattivare il negozio?" : `Sospendere ${shop.name}?`}
            testId="stato-negozio"
          >
            <input type="hidden" name="shopId" value={shop.id} />
            <input type="hidden" name="status" value={suspended ? "active" : "suspended"} />
            <label>
              Motivo
              <input
                name="reason"
                required
                minLength={5}
                placeholder="abbonamento non rinnovato"
                data-testid="stato-motivo"
              />
            </label>
          </ActionForm>
        </section>
      </>
    );
  });
}
