import type { CustomerItem } from "@loyalty/shared/api";
import type { z } from "zod";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";

export type Customer = z.output<typeof CustomerItem>;
export type CustomerFilter = "tutti" | "premio" | "inattivi";

/**
 * Lista clienti del titolare: ricerca (nome, telefono o codice breve) con un breve ritardo
 * sulla digitazione, filtro, paginazione a cursore ("carica altri" a fine lista).
 */
export function useCustomers(shopId: string, query: string, filter: CustomerFilter) {
  const [items, setItems] = useState<Customer[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const run = useRef(0);

  const load = useCallback(
    async (q: string) => {
      const id = ++run.current;
      setLoading(true);
      try {
        const r = await api.call("customers", { shopId, query: { q: q || undefined, filter, limit: 25 } });
        if (id !== run.current) return;
        setItems(r.items);
        setCursor(r.nextCursor);
        setError(null);
      } catch (e) {
        if (!(e instanceof ApiError)) throw e;
        if (id === run.current) setError(e);
      } finally {
        if (id === run.current) setLoading(false);
      }
    },
    [shopId, filter],
  );

  // 300 ms dopo l'ultima lettera: niente richiesta per ogni tasto
  useEffect(() => {
    const t = setTimeout(() => void load(query.trim()), query ? 300 : 0);
    return () => clearTimeout(t);
  }, [query, load]);

  const loadMore = useCallback(async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const r = await api.call("customers", {
        shopId,
        query: { q: query.trim() || undefined, filter, cursor, limit: 25 },
      });
      setItems((prev) => [...prev, ...r.items.filter((c) => !prev.some((p) => p.id === c.id))]);
      setCursor(r.nextCursor);
    } catch (e) {
      if (!(e instanceof ApiError)) throw e;
      setError(e);
    } finally {
      setLoadingMore(false);
    }
  }, [cursor, loadingMore, shopId, query, filter]);

  /** Dopo una modifica nel dettaglio (saldo, consenso) o una cancellazione. */
  const update = useCallback((c: Customer | { id: string; deleted: true }) => {
    setItems((prev) =>
      "deleted" in c ? prev.filter((p) => p.id !== c.id) : prev.map((p) => (p.id === c.id ? { ...p, ...c } : p)),
    );
  }, []);

  return {
    items,
    loading,
    loadingMore,
    error,
    hasMore: cursor !== null,
    loadMore,
    reload: () => load(query.trim()),
    update,
  };
}
