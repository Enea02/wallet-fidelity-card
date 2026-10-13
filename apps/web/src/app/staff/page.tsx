"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient, type Session } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://localhost",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "missing",
);

interface ShopLite {
  id: string;
  name: string;
  stamps_required: number;
  reward_label: string;
}
interface CardView {
  name: string;
  stamps: number;
  stampsRequired: number;
  rewardsAvailable: number;
  rewardLabel: string;
}

export default function StaffPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!ready)
    return (
      <main>
        <p className="muted">Caricamento…</p>
      </main>
    );
  return <main>{session ? <Stamper session={session} /> : <Login />}</main>;
}

function Login() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: String(f.get("email")),
      password: String(f.get("password")),
    });
    setBusy(false);
    if (error) setError("Credenziali non valide");
  }

  return (
    <>
      <h1>Accesso staff</h1>
      <form className="card" onSubmit={onSubmit}>
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" required autoComplete="username" />
        <label htmlFor="password">Password</label>
        <input id="password" name="password" type="password" required autoComplete="current-password" />
        <button type="submit" disabled={busy}>
          {busy ? "Accesso…" : "Entra"}
        </button>
        {error && <p className="error">{error}</p>}
      </form>
    </>
  );
}

function Stamper({ session }: { session: Session }) {
  const [shops, setShops] = useState<ShopLite[]>([]);
  const [shop, setShop] = useState<ShopLite | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [card, setCard] = useState<CardView | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [scanKey, setScanKey] = useState(0); // cambia = scanner riavviato

  const api = useCallback(
    async (path: string, body?: unknown) => {
      const res = await fetch(path, {
        method: body ? "POST" : "GET",
        headers: { authorization: `Bearer ${session.access_token}`, "content-type": "application/json" },
        ...(body !== undefined && { body: JSON.stringify(body) }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Errore");
      return json;
    },
    [session.access_token],
  );

  useEffect(() => {
    api("/api/staff/shops")
      .then((j: { shops: ShopLite[] }) => {
        setShops(j.shops);
        if (j.shops.length === 1) setShop(j.shops[0] ?? null);
      })
      .catch((e: Error) => setMsg({ ok: false, text: e.message }));
  }, [api]);

  const onScan = useCallback(
    async (value: string) => {
      if (!shop) return;
      setMsg(null);
      try {
        const j = await api("/api/staff/lookup", { shopId: shop.id, qrToken: value.trim() });
        setQr(value.trim());
        setCard(j.customer);
      } catch (e) {
        setMsg({ ok: false, text: (e as Error).message });
        setScanKey((k) => k + 1); // permette di riprovare con un altro QR
      }
    },
    [api, shop],
  );

  async function act(kind: "stamp" | "redeem") {
    if (!shop || !qr) return;
    setBusy(true);
    try {
      const j = await api(`/api/staff/${kind}`, { shopId: shop.id, qrToken: qr });
      setCard(j.customer);
      setMsg({
        ok: true,
        text:
          kind === "redeem"
            ? "Premio riscattato."
            : j.rewardUnlocked
              ? `Premio sbloccato: ${j.customer.rewardLabel}!`
              : "Timbro aggiunto.",
      });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  function next() {
    setQr(null);
    setCard(null);
    setMsg(null);
  }

  if (!shop) {
    return (
      <>
        <h1>Scegli il negozio</h1>
        {shops.map((s) => (
          <button key={s.id} className="secondary" onClick={() => setShop(s)}>
            {s.name}
          </button>
        ))}
        {shops.length === 0 && !msg && <p className="muted">Nessun negozio associato a questo utente.</p>}
        {msg && <p className="error">{msg.text}</p>}
        <button className="secondary" onClick={() => supabase.auth.signOut()}>
          Esci
        </button>
      </>
    );
  }

  return (
    <>
      <h1>{shop.name}</h1>
      {!card ? (
        <>
          <p className="muted">Inquadra il QR sulla carta del cliente.</p>
          <Scanner key={scanKey} onScan={onScan} />
          {msg && <p className={msg.ok ? "ok" : "error"}>{msg.text}</p>}
        </>
      ) : (
        <div className="card">
          <strong style={{ fontSize: "1.2rem" }}>{card.name}</strong>
          <div className="stamps">
            {Array.from({ length: card.stampsRequired }, (_, i) => (
              <div key={i} className={`stamp${i < card.stamps ? " on" : ""}`} />
            ))}
          </div>
          <p className="muted">
            {card.stamps} / {card.stampsRequired} timbri · premi disponibili: <strong>{card.rewardsAvailable}</strong>
          </p>
          {msg && <p className={msg.ok ? "ok" : "error"}>{msg.text}</p>}
          <div className="row">
            <button onClick={() => act("stamp")} disabled={busy}>
              +1 timbro
            </button>
            <button onClick={() => act("redeem")} disabled={busy || card.rewardsAvailable < 1} className="secondary">
              Riscatta {card.rewardLabel.toLowerCase()}
            </button>
          </div>
          <button className="secondary" onClick={next}>
            Cliente successivo
          </button>
        </div>
      )}
      <button className="secondary" onClick={() => supabase.auth.signOut()}>
        Esci
      </button>
    </>
  );
}

/** Scanner fotocamera; si ferma al primo QR letto. */
function Scanner({ onScan }: { onScan: (value: string) => void }) {
  const done = useRef(false);

  useEffect(() => {
    let stop: (() => Promise<void>) | null = null;
    let cancelled = false;
    done.current = false;

    import("html5-qrcode").then(({ Html5Qrcode }) => {
      if (cancelled) return;
      const scanner = new Html5Qrcode("reader");
      stop = async () => {
        if (scanner.isScanning) await scanner.stop();
        scanner.clear();
      };
      scanner
        .start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 240, height: 240 } },
          (text) => {
            if (done.current) return;
            done.current = true;
            onScan(text);
          },
          () => {},
        )
        .catch(() => {});
    });

    return () => {
      cancelled = true;
      void stop?.();
    };
  }, [onScan]);

  return <div id="reader" />;
}
