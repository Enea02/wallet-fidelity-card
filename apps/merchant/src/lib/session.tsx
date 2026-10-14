import type { Role, ShopSummary } from "@loyalty/shared/api";
import type { z } from "zod";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, ApiError, setSessionExpiredHandler } from "./api";
import { authFailure, type AuthFailure } from "./auth/errors";
import { prefs, supabase } from "./auth/supabase";
import { log, setLogContext } from "./diagnostics/logger";

/*
 * Sessione dello staff: utente, negozi (GET me + GET shops), negozio attivo e ruolo.
 * Il ruolo decide le sezioni visibili; il negozio attivo va in X-Shop-Id e nei log.
 */

export type Shop = z.output<typeof ShopSummary> & { displayName: string };

export type SessionStatus = "loading" | "signedOut" | "chooseShop" | "noShops" | "ready" | "error";

interface SessionValue {
  status: SessionStatus;
  user: { id: string; email: string | null } | null;
  shops: Shop[];
  shop: Shop | null;
  role: Role | null;
  /** Errore nel caricare utente e negozi (es. server non raggiungibile). */
  error: ApiError | null;
  /** Messaggio da mostrare nella schermata di accesso (es. sessione scaduta). */
  notice: string | null;
  signIn: (email: string, password: string) => Promise<AuthFailure | null>;
  signOut: (reason?: "manuale" | "sessione scaduta") => Promise<void>;
  selectShop: (id: string, how: "scelta" | "cambio") => void;
  /** Ricarica utente e negozi (dopo un errore o dopo aver accettato un invito). */
  reload: () => Promise<number>;
}

const SessionContext = createContext<SessionValue | null>(null);

const shopKey = (userId: string) => `lw.negozio.${userId}`;

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>("loading");
  const [user, setUser] = useState<SessionValue["user"]>(null);
  const [shops, setShops] = useState<Shop[]>([]);
  const [shop, setShop] = useState<Shop | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const loading = useRef(false);

  const activate = useCallback((s: Shop, userId: string, how: "unico negozio" | "scelta" | "cambio" | "ricordato") => {
    setShop(s);
    setStatus("ready");
    setLogContext({ shop_id: s.id, role: s.role, user_id: userId });
    log.event("app.shop.selected", { shop_name: s.name, role: s.role, how });
    void prefs.setItem(shopKey(userId), s.id);
  }, []);

  const reset = useCallback(() => {
    setUser(null);
    setShops([]);
    setShop(null);
    setError(null);
    setStatus("signedOut");
    setLogContext({ shop_id: undefined, role: undefined, user_id: undefined });
  }, []);

  /** Carica utente e negozi; restituisce il numero di negozi (per app.login.ok). */
  const reload = useCallback(async (): Promise<number> => {
    if (loading.current) return 0;
    loading.current = true;
    setStatus("loading");
    try {
      const [me, list] = await Promise.all([api.call("me", {}), api.call("shops", {})]);
      const names = new Map(me.memberships.map((m) => [m.shopId, m.displayName]));
      const all: Shop[] = list.shops.map((s) => ({ ...s, displayName: names.get(s.id) ?? "" }));
      setUser(me.user);
      setShops(all);
      setError(null);
      setLogContext({ user_id: me.user.id });
      if (all.length === 0) {
        setStatus("noShops");
        return 0;
      }
      if (all.length === 1) {
        activate(all[0]!, me.user.id, "unico negozio");
        return 1;
      }
      const saved = await prefs.getItem(shopKey(me.user.id));
      const remembered = all.find((s) => s.id === saved);
      if (remembered) activate(remembered, me.user.id, "ricordato");
      else setStatus("chooseShop");
      return all.length;
    } catch (e) {
      if (e instanceof ApiError && (e.code === "E_SESSION_EXPIRED" || e.code === "E_AUTH_INVALID")) {
        reset();
        return 0;
      }
      setError(e instanceof ApiError ? e : null);
      setStatus("error");
      return 0;
    } finally {
      loading.current = false;
    }
  }, [activate, reset]);

  const signOut = useCallback(
    async (reason: "manuale" | "sessione scaduta" = "manuale") => {
      log.event("app.logout", { reason });
      await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
      setNotice(reason === "sessione scaduta" ? "La sessione è scaduta. Accedi di nuovo." : null);
      reset();
    },
    [reset],
  );

  const signIn = useCallback(
    async (email: string, password: string): Promise<AuthFailure | null> => {
      setNotice(null);
      const { error: err } = await supabase.auth
        .signInWithPassword({ email: email.trim(), password })
        .catch((e: unknown) => ({ error: { status: 0, message: String(e) } }));
      if (err) {
        const f = authFailure(err);
        log.event("app.login.failed", { email: email.trim(), error_code: f.code, reason: f.reason });
        return f;
      }
      const count = await reload();
      log.event("app.login.ok", { email: email.trim(), shops_count: count });
      return null;
    },
    [reload],
  );

  const selectShop = useCallback(
    (id: string, how: "scelta" | "cambio") => {
      const s = shops.find((x) => x.id === id);
      if (s && user) activate(s, user.id, how);
    },
    [activate, shops, user],
  );

  useEffect(() => {
    setSessionExpiredHandler(() => void signOut("sessione scaduta"));
    let alive = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      if (data.session) void reload();
      else setStatus("signedOut");
    });
    const { data } = supabase.auth.onAuthStateChange((event) => {
      // niente chiamate a Supabase qui dentro (indicazione di supabase-js): solo stato
      if (event === "SIGNED_OUT") reset();
    });
    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, [reload, reset, signOut]);

  const value = useMemo<SessionValue>(
    () => ({ status, user, shops, shop, role: shop?.role ?? null, error, notice, signIn, signOut, selectShop, reload }),
    [status, user, shops, shop, error, notice, signIn, signOut, selectShop, reload],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const v = useContext(SessionContext);
  if (!v) throw new Error("useSession fuori da SessionProvider");
  return v;
}

/** Negozio attivo (solo nelle schermate dentro l'app, dove la sessione è "ready"). */
export function useShop(): Shop {
  const { shop } = useSession();
  if (!shop) throw new Error("nessun negozio attivo");
  return shop;
}
