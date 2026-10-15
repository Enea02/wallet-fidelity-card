import type { MerchantEndpoint } from "@loyalty/shared/api";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import type { ApiResponse, CallOptions } from "@/lib/api/client";

export interface ApiState<T> {
  data: T | null;
  error: ApiError | null;
  loading: boolean;
  reload: () => Promise<void>;
}

/**
 * Lettura dal backend per le schermate del titolare: caricamento, errore del catalogo
 * (da mostrare con <ErrorNotice>) e ricarica. Riparte da sola se cambiano le opzioni.
 */
export function useApi<K extends MerchantEndpoint>(key: K, opts: CallOptions<K>): ApiState<ApiResponse<K>> {
  const [data, setData] = useState<ApiResponse<K> | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const optsKey = JSON.stringify(opts);
  const latest = useRef(0);

  const reload = useCallback(async () => {
    const run = ++latest.current;
    setLoading(true);
    try {
      const out = await api.call(key, JSON.parse(optsKey) as CallOptions<K>);
      if (run !== latest.current) return; // risposta superata da una richiesta più recente
      setData(out);
      setError(null);
    } catch (e) {
      if (!(e instanceof ApiError)) throw e;
      if (run === latest.current) setError(e);
    } finally {
      if (run === latest.current) setLoading(false);
    }
  }, [key, optsKey]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, error, loading, reload };
}
