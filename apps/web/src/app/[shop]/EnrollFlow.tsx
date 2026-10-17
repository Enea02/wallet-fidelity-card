"use client";

import type { EnrollStartResponse, EnrollVerifyResponse } from "@loyalty/shared/api";
import { checkItalianMobile } from "@loyalty/shared/phone";
import { useCallback, useEffect, useRef, useState } from "react";
import type { z } from "zod";
import { PublicApiError, publicPost } from "../_components/public-api";
import { SupportCode } from "../_components/SupportCode";
import { stripUrl, type PublicProduct, type PublicShop } from "@/lib/public/shop-view";
import { useTurnstile } from "./useTurnstile";

/*
 * Iscrizione del cliente (design A1–A5): form → codice SMS → carta pronta.
 * Una decisione per schermata, pulsante principale in basso. Nessun dato personale in URL.
 */

type Started = z.infer<typeof EnrollStartResponse>;
type Verified = z.infer<typeof EnrollVerifyResponse>;
type Problem = { message: string; supportCode: string; code: string };
type Platform = "android" | "ios" | "desktop";

const toProblem = (e: unknown): Problem =>
  e instanceof PublicApiError
    ? { message: e.message, supportCode: e.supportCode, code: e.code }
    : { message: "Si è verificato un errore. Riprova.", supportCode: "", code: "E_INTERNAL" };

function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  if (/Android/i.test(ua)) return "android";
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "ios";
  return "desktop";
}

function ProblemNotice({ problem, focus }: { problem: Problem; focus?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (focus) ref.current?.focus();
  }, [focus, problem]);
  return (
    <div className="lw-alert" role="alert" tabIndex={-1} ref={ref}>
      <span className="icon" aria-hidden="true">
        !
      </span>
      <div>
        <div>{problem.message}</div>
        {problem.supportCode && <SupportCode code={problem.supportCode} />}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* A1/A2 · Form                                                        */
/* ------------------------------------------------------------------ */

interface FormValues {
  name: string;
  prefix: string;
  phone: string;
  privacy: boolean;
  marketing: boolean;
}
type FieldErrors = Partial<Record<"name" | "phone" | "privacy", string>>;

function validate(v: FormValues): FieldErrors {
  const e: FieldErrors = {};
  if (v.name.trim().length < 2) e.name = "Scrivi il tuo nome.";
  const p = checkItalianMobile(v.phone, v.prefix);
  if (!p.ok) e.phone = p.message;
  if (!v.privacy) e.privacy = "Senza consenso non possiamo creare la carta.";
  return e;
}

function EnrollForm({
  shop,
  product,
  siteKey,
  initial,
  onStarted,
}: {
  shop: PublicShop;
  product: PublicProduct | undefined;
  siteKey: string;
  initial: FormValues;
  onStarted: (s: Started, values: FormValues) => void;
}) {
  const [v, setV] = useState<FormValues>(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [summary, setSummary] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [busy, setBusy] = useState(false);
  const captcha = useTurnstile(siteKey);
  const errorCount = Object.keys(errors).length;

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    const e = validate(v);
    setErrors(e);
    setSummary(Object.keys(e).length > 0);
    setProblem(null);
    if (Object.keys(e).length > 0) return;
    setBusy(true);
    try {
      const captchaToken = await captcha.token();
      const started = await publicPost<Started>("/api/public/enroll/start", {
        shopSlug: shop.slug,
        name: v.name.trim(),
        phone: v.phone,
        phonePrefix: v.prefix,
        consentPrivacy: true,
        consentMarketing: v.marketing,
        captchaToken,
        ...(product && { productCode: product.code }),
      });
      onStarted(started, v);
    } catch (err) {
      const p = toProblem(err);
      if (p.code === "E_PHONE_INVALID") setErrors({ phone: p.message });
      setProblem(p);
      captcha.reset();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="lw-body" onSubmit={submit} noValidate onFocus={captcha.activate} onPointerDown={captcha.activate}>
      {summary && errorCount > 0 && (
        <ProblemNotice
          focus
          problem={{
            message:
              errorCount === 1 ? "Controlla il campo evidenziato." : `Controlla i ${errorCount} campi evidenziati.`,
            supportCode: "",
            code: "E_VALIDATION",
          }}
        />
      )}
      {problem && problem.code !== "E_PHONE_INVALID" && <ProblemNotice problem={problem} focus />}

      <div className="lw-field">
        <label htmlFor="name">Nome</label>
        <input
          id="name"
          className="lw-input"
          autoComplete="given-name"
          value={v.name}
          maxLength={60}
          aria-invalid={Boolean(errors.name)}
          aria-describedby={errors.name ? "name-error" : undefined}
          onChange={(e) => setV({ ...v, name: e.target.value })}
        />
        {errors.name && (
          <span id="name-error" className="lw-field-error">
            {errors.name}
          </span>
        )}
      </div>

      <div className="lw-field">
        <label htmlFor="phone">Telefono</label>
        <div className={`lw-phone${errors.phone ? " invalid" : ""}`}>
          <input
            className="prefix"
            aria-label="Prefisso"
            value={v.prefix}
            maxLength={5}
            inputMode="tel"
            onChange={(e) => setV({ ...v, prefix: e.target.value })}
          />
          <input
            id="phone"
            className="number"
            type="tel"
            inputMode="tel"
            autoComplete="tel-national"
            value={v.phone}
            maxLength={20}
            aria-invalid={Boolean(errors.phone)}
            aria-describedby={errors.phone ? "phone-error" : undefined}
            onChange={(e) => setV({ ...v, phone: e.target.value })}
            onBlur={() => {
              // validazione alla perdita del focus, non a ogni tasto (design C4)
              if (!v.phone) return;
              const p = checkItalianMobile(v.phone, v.prefix);
              setErrors((old) => {
                const { phone: _ignored, ...rest } = old;
                return p.ok ? rest : { ...rest, phone: p.message };
              });
            }}
          />
        </div>
        {errors.phone && (
          <span id="phone-error" className="lw-field-error">
            {errors.phone}
          </span>
        )}
      </div>

      <label className="lw-check" style={{ marginTop: 4 }}>
        <input
          type="checkbox"
          checked={v.privacy}
          aria-invalid={Boolean(errors.privacy)}
          aria-describedby={errors.privacy ? "privacy-error" : undefined}
          onChange={(e) => setV({ ...v, privacy: e.target.checked })}
        />
        <span>
          Accetto l&apos;
          <a href={`/${shop.slug}/privacy`} target="_blank" rel="noreferrer">
            informativa privacy
          </a>{" "}
          <span className="optional">(obbligatorio)</span>
          {errors.privacy && (
            <span id="privacy-error" className="lw-field-error" style={{ display: "block", marginTop: 4 }}>
              {errors.privacy}
            </span>
          )}
        </span>
      </label>
      <label className="lw-check">
        <input type="checkbox" checked={v.marketing} onChange={(e) => setV({ ...v, marketing: e.target.checked })} />
        <span>
          Avvisami di offerte e novità di {shop.name} <span className="optional">(facoltativo)</span>
        </span>
      </label>

      <div ref={captcha.ref} />

      <div className="lw-bottom">
        <button className="lw-btn" type="submit" disabled={busy}>
          {busy ? "Un momento…" : product ? "Crea la mia tessera" : "Crea la mia carta"}
        </button>
        <span className="lw-note">Niente app da scaricare. Gratis, per sempre.</span>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* A3/A4 · Codice SMS                                                  */
/* ------------------------------------------------------------------ */

function OtpStep({
  started,
  onBack,
  onVerified,
}: {
  started: Started;
  onBack: () => void;
  onVerified: (v: Verified) => void;
}) {
  const [code, setCode] = useState("");
  const [problem, setProblem] = useState<Problem | null>(null);
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [resendAt, setResendAt] = useState(() => Date.now() + started.resendInSeconds * 1000);
  const [now, setNow] = useState(() => Date.now());
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);
  useEffect(() => inputRef.current?.focus(), []);

  const verify = useCallback(
    async (value: string) => {
      setBusy(true);
      setProblem(null);
      try {
        onVerified(
          await publicPost<Verified>("/api/public/enroll/verify", { enrollmentId: started.enrollmentId, code: value }),
        );
      } catch (err) {
        const p = toProblem(err);
        setProblem(p);
        if (p.code === "E_OTP_TOO_MANY_ATTEMPTS" || p.code === "E_OTP_EXPIRED") setBlocked(true);
        else if (p.code === "E_OTP_WRONG_CODE") {
          // le cifre sbagliate restano visibili in rosso (design A4); la prima cifra nuova le sostituisce
          requestAnimationFrame(() => {
            inputRef.current?.focus();
            inputRef.current?.select();
          });
        }
      } finally {
        setBusy(false);
      }
    },
    [onVerified, started.enrollmentId],
  );

  async function resend() {
    setProblem(null);
    try {
      const r = await publicPost<{ resendInSeconds: number }>("/api/public/enroll/resend", {
        enrollmentId: started.enrollmentId,
      });
      setResendAt(Date.now() + r.resendInSeconds * 1000);
      setCode("");
      inputRef.current?.focus();
    } catch (err) {
      setProblem(toProblem(err));
    }
  }

  const left = Math.max(0, Math.ceil((resendAt - now) / 1000));
  const wrong = problem?.code === "E_OTP_WRONG_CODE";
  const digits = code.split("");

  return (
    <div className="lw-body" style={{ gap: 20 }}>
      <button type="button" className="lw-back" aria-label="Cambia numero" onClick={onBack}>
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M15 5 8 12l7 7" />
        </svg>
      </button>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <h1 className="lw-title">Controlla gli SMS</h1>
        <p className="lw-lead">
          Abbiamo mandato un codice di 6 cifre al <strong>{started.phoneDisplay}</strong>.{" "}
          <button type="button" className="lw-link-btn" style={{ fontSize: 16 }} onClick={onBack}>
            Cambia numero
          </button>
        </p>
      </div>

      <div className={`lw-otp${wrong ? " error" : ""}`}>
        <label htmlFor="otp" className="visually-hidden">
          Codice di verifica di 6 cifre
        </label>
        <input
          id="otp"
          ref={inputRef}
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={6}
          value={code}
          disabled={busy || blocked}
          aria-invalid={wrong}
          aria-describedby="otp-help"
          onChange={(e) => {
            const value = e.target.value.replace(/\D/g, "").slice(0, 6);
            setCode(value);
            if (wrong) setProblem(null);
            if (value.length === 6) void verify(value); // si verifica da solo alla sesta cifra
          }}
        />
        <div className="boxes" aria-hidden="true">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className={`box${digits[i] ? "" : i === code.length && !busy ? " current" : " empty"}`}>
              {digits[i]}
            </div>
          ))}
        </div>
      </div>

      {problem &&
        (wrong ? (
          <span className="lw-field-error" role="alert" style={{ marginTop: -8 }}>
            {problem.message}
          </span>
        ) : (
          <ProblemNotice problem={problem} />
        ))}

      {!blocked &&
        (left > 0 ? (
          <span className="lw-countdown">
            Non è arrivato? Nuovo codice tra{" "}
            <strong>
              {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}
            </strong>
          </span>
        ) : (
          <button type="button" className="lw-btn-secondary" onClick={resend}>
            Invia un nuovo codice
          </button>
        ))}
      {blocked && (
        <button type="button" className="lw-btn-secondary" onClick={onBack}>
          Ricomincia
        </button>
      )}

      <div className="lw-bottom">
        <span id="otp-help" className="lw-note">
          {wrong
            ? "Dopo 5 errori il numero si blocca per 15 minuti."
            : "Il codice si verifica da solo alla sesta cifra. Lo puoi anche incollare."}
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* A5 · Carta pronta                                                   */
/* ------------------------------------------------------------------ */

function Qr({ value, label }: { value: string; label: string }) {
  const [svg, setSvg] = useState("");
  useEffect(() => {
    // libreria caricata solo qui (schermata finale), non con la pagina
    void import("qrcode")
      .then((QRCode) =>
        QRCode.toString(value, { type: "svg", margin: 0, color: { dark: "#1E1915", light: "#FFFFFF" } }),
      )
      .then(setSvg);
  }, [value]);
  return <div role="img" aria-label={label} dangerouslySetInnerHTML={{ __html: svg }} />;
}

function track(enrollmentId: string, step: "link.shown" | "link.clicked", wallet: string) {
  void fetch("/api/public/funnel", {
    method: "POST",
    keepalive: true,
    headers: { "content-type": "application/json", "x-platform": "public-web" },
    body: JSON.stringify({ enrollmentId, step, wallet }),
  }).catch(() => {});
}

function Done({ shop, verified, enrollmentId }: { shop: PublicShop; verified: Verified; enrollmentId: string }) {
  const [platform, setPlatform] = useState<Platform | null>(null);
  const card = verified.card;
  const wallet =
    platform === "ios" || !verified.googleSaveUrl
      ? "apple-in-arrivo"
      : platform === "desktop"
        ? "qr-da-computer"
        : "google";

  useEffect(() => setPlatform(detectPlatform()), []);
  useEffect(() => {
    if (platform) track(enrollmentId, "link.shown", wallet);
  }, [platform, wallet, enrollmentId]);

  return (
    <div className="lw-body" style={{ gap: 22 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span className="lw-done-label">Fatto</span>
        <h1 className="lw-done-title">
          {verified.prepaid
            ? verified.status === "returning"
              ? `Ciao ${verified.firstName}, hai già questa tessera: eccola.`
              : `Ciao ${verified.firstName}, la tua tessera è pronta.`
            : verified.status === "returning"
              ? `Ciao ${verified.firstName}, hai già una carta qui: eccola.`
              : `Ciao ${verified.firstName}, la tua carta è pronta.`}
        </h1>
      </div>

      {verified.prepaid ? (
        <div
          className="lw-card"
          aria-label={`${verified.prepaid.productName} di ${shop.name}: ${verified.prepaid.module.header}`}
        >
          <div className="top">
            {/* eslint-disable-next-line @next/next/no-img-element -- logo o monogramma generato */}
            <img src={shop.logo} alt="" />
            <strong>{verified.prepaid.productName}</strong>
            <span className="count" data-testid="tessera-saldo">
              {verified.prepaid.state === "da_attivare"
                ? "—"
                : `${verified.prepaid.balance} ${verified.prepaid.unitPlural}`}
            </span>
          </div>
          <div style={{ padding: "4px 18px 18px", display: "grid", gap: 4 }}>
            <strong data-testid="tessera-stato">{verified.prepaid.module.header}</strong>
            <span style={{ opacity: 0.85 }}>{verified.prepaid.module.body}</span>
          </div>
        </div>
      ) : (
        <div className="lw-card" aria-label={`Carta ${shop.name}: ${card.stamps} timbri su ${card.stampsRequired}`}>
          <div className="top">
            {/* eslint-disable-next-line @next/next/no-img-element -- logo o monogramma generato */}
            <img src={shop.logo} alt="" />
            <strong>{shop.name}</strong>
            <span className="count">
              {card.stamps} / {card.stampsRequired}
            </span>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element -- SVG generato */}
          <img
            src={stripUrl(shop, card.stamps, card.rewardsAvailable)}
            alt=""
            className="lw-strip"
            style={{ width: "100%", height: "auto", borderRadius: 0 }}
          />
        </div>
      )}

      <p className="lw-lead">
        {verified.prepaid
          ? verified.prepaid.state === "da_attivare"
            ? "Paga la tessera in cassa: la attiviamo subito. "
            : ""
          : verified.status === "returning"
            ? "I tuoi timbri sono conservati. "
            : ""}
        {wallet === "apple-in-arrivo"
          ? "Mostra questo QR alla cassa a ogni visita: ti conviene fare uno screenshot."
          : verified.prepaid
            ? "Salvala nel wallet: si aggiorna da sola quando la attiviamo e a ogni utilizzo."
            : "Salvala nel wallet: la trovi sempre sul telefono e si aggiorna da sola a ogni timbro."}
      </p>

      <div className="lw-bottom" style={{ gap: 14 }}>
        {wallet === "google" && verified.googleSaveUrl && (
          <a
            className="lw-wallet-badge"
            href={verified.googleSaveUrl}
            onClick={() => track(enrollmentId, "link.clicked", "google")}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- badge ufficiale Google, non va ridimensionato liberamente */}
            <img src="/brand/aggiungi-a-google-wallet.svg" alt="Aggiungi a Google Wallet" />
          </a>
        )}
        {wallet === "qr-da-computer" && (
          <>
            <div className="lw-qr-box">
              <Qr value={verified.phoneLink} label="QR per aprire la carta sul telefono" />
              <span>Inquadra il QR con il telefono per salvare la carta nel wallet.</span>
            </div>
            {verified.googleSaveUrl && (
              <a
                className="lw-wallet-badge"
                href={verified.googleSaveUrl}
                onClick={() => track(enrollmentId, "link.clicked", "google")}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- badge ufficiale Google */}
                <img src="/brand/aggiungi-a-google-wallet.svg" alt="Aggiungi a Google Wallet" />
              </a>
            )}
          </>
        )}
        {wallet === "apple-in-arrivo" && (
          <div className="lw-qr-box">
            <Qr value={card.qrToken} label="QR della tua carta da mostrare in cassa" />
            <span className="lw-code">{card.shortCode}</span>
            <span className="lw-note">
              La carta per Apple Wallet arriva a breve: per ora mostra questo QR o il codice.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function EnrollFlow({
  shop,
  product,
  siteKey,
  header,
}: {
  shop: PublicShop;
  /** Iscrizione a una tessera prepagata (Fase 9.5); assente = carta fedeltà. */
  product?: PublicProduct;
  siteKey: string;
  header: React.ReactNode;
}) {
  const [values, setValues] = useState<FormValues>({
    name: "",
    prefix: "+39",
    phone: "",
    privacy: false,
    marketing: false,
  });
  const [started, setStarted] = useState<Started | null>(null);
  const [verified, setVerified] = useState<Verified | null>(null);

  if (verified && started) return <Done shop={shop} verified={verified} enrollmentId={started.enrollmentId} />;
  if (started) return <OtpStep started={started} onBack={() => setStarted(null)} onVerified={setVerified} />;
  return (
    <>
      {header}
      <EnrollForm
        shop={shop}
        product={product}
        siteKey={siteKey}
        initial={values}
        onStarted={(s, v) => {
          setValues(v);
          setStarted(s);
        }}
      />
    </>
  );
}
