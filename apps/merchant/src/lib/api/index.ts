import { app, config } from "../config";
import { supabase } from "../auth/supabase";
import { log } from "../diagnostics/logger";
import { isOnline } from "../network";
import { createApiClient } from "./client";

export { ApiError } from "./client";

let onExpired: () => void = () => undefined;
/** La sessione registra qui cosa fare quando il token non si può rinnovare. */
export const setSessionExpiredHandler = (fn: () => void) => {
  onExpired = fn;
};

export const api = createApiClient({
  baseUrl: config.apiUrl,
  fetch: (...args) => fetch(...args),
  platform: app.platform,
  appVersion: app.version,
  build: app.build,
  getAccessToken: async () => (await supabase.auth.getSession()).data.session?.access_token ?? null,
  refreshSession: async () => {
    const { data, error } = await supabase.auth.refreshSession();
    return error ? null : (data.session?.access_token ?? null);
  },
  onSessionExpired: () => onExpired(),
  isOnline,
  logError: (fields) =>
    log.event("app.api.error", fields, {
      level: fields.http_status !== null && fields.http_status >= 500 ? "error" : "warn",
    }),
});
