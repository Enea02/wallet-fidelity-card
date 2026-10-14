import { redact } from "@loyalty/shared/logger";
import * as Sentry from "@sentry/react-native";
import { app, config } from "../config";

/*
 * Sentry per crash ed errori JS su iOS, Android e web. Senza EXPO_PUBLIC_SENTRY_DSN resta spento
 * (sviluppo, test): il buffer locale della diagnostica funziona comunque.
 * Privacy: niente dati personali di default, ogni evento e breadcrumb passa dalla stessa
 * redazione del logger (token, JWT, telefono, email).
 */
export const sentryEnabled = config.sentryDsn !== "";

export const navigationIntegration = Sentry.reactNavigationIntegration({ enableTimeToInitialDisplay: false });

export function initSentry() {
  if (!sentryEnabled) return;
  Sentry.init({
    dsn: config.sentryDsn,
    environment: config.env,
    dist: app.build,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    integrations: [navigationIntegration],
    beforeSend: (event) => redact(event),
    beforeBreadcrumb: (crumb) => redact(crumb),
  });
  Sentry.setTags({ platform: app.platform, app_version: app.version, build: app.build });
}

/** Campi standard su ogni evento Sentry (stessi nomi dei log del backend). */
export function setSentryScope(ctx: {
  shop_id?: string | undefined;
  user_id?: string | undefined;
  role?: string | undefined;
}) {
  if (!sentryEnabled) return;
  Sentry.setUser(ctx.user_id ? { id: ctx.user_id } : null);
  Sentry.setTag("shop_id", ctx.shop_id ?? null);
  Sentry.setTag("role", ctx.role ?? null);
}

export { Sentry };
