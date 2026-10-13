"use client";

import { useState } from "react";

export default function EnrollForm({ shopSlug, accent }: { shopSlug: string; accent: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [googleUrl, setGoogleUrl] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/enroll", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          shopSlug,
          name: f.get("name"),
          phone: f.get("phone"),
          consentPrivacy: f.get("privacy") === "on",
          consentMarketing: f.get("marketing") === "on",
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Errore");
      setGoogleUrl(json.googleSaveUrl);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="card">
        <p className="ok">Iscrizione completata!</p>
        <p className="muted">Aggiungi la carta al telefono e mostrala in cassa a ogni visita.</p>
        {googleUrl ? (
          <a className="btn" href={googleUrl} style={{ background: "#000" }}>
            Aggiungi a Google Wallet
          </a>
        ) : (
          <p className="muted">Google Wallet non è configurato su questo ambiente.</p>
        )}
        <p className="muted" style={{ fontSize: "0.82rem", marginTop: 12 }}>
          Su iPhone l&apos;aggiunta ad Apple Wallet arriverà a breve.
        </p>
      </div>
    );
  }

  return (
    <form className="card" onSubmit={onSubmit}>
      <label htmlFor="name">Nome</label>
      <input id="name" name="name" type="text" required minLength={2} maxLength={80} autoComplete="given-name" />

      <label htmlFor="phone">Telefono</label>
      <input id="phone" name="phone" type="tel" required autoComplete="tel" placeholder="+39 333 1234567" />

      <label className="check">
        <input type="checkbox" name="privacy" required />
        <span>
          Ho letto l&apos;<a href="/privacy">informativa privacy</a> e acconsento al trattamento dei dati per la carta
          fedeltà (obbligatorio).
        </span>
      </label>
      <label className="check">
        <input type="checkbox" name="marketing" />
        <span>Voglio ricevere promozioni e novità sulla carta (facoltativo).</span>
      </label>

      <button type="submit" disabled={busy} style={{ background: accent }}>
        {busy ? "Attendere…" : "Ottieni la carta"}
      </button>
      {error && <p className="error">{error}</p>}
    </form>
  );
}
