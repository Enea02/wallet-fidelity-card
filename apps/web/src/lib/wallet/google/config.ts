import "server-only";
import { optionalEnv, requireEnv } from "../../env";

/**
 * Configurazione di Google Wallet. Attivo solo con Issuer ID e chiave del service account:
 * senza (es. sviluppo locale senza credenziali) iscrizioni e timbri funzionano, nessuna carta Google.
 */
export function googleEnabled(): boolean {
  return Boolean(optionalEnv("GOOGLE_WALLET_ISSUER_ID") && optionalEnv("GOOGLE_WALLET_SA_KEY_B64"));
}

export interface ServiceAccountKey {
  client_email: string;
  private_key: string;
  /** Endpoint OAuth del token (nei test punta all'API Google simulata). */
  token_uri?: string;
}

let cached: { raw: string; key: ServiceAccountKey } | null = null;
export function serviceAccount(): ServiceAccountKey {
  const raw = requireEnv("GOOGLE_WALLET_SA_KEY_B64");
  if (cached?.raw !== raw) {
    cached = { raw, key: JSON.parse(Buffer.from(raw, "base64").toString("utf8")) as ServiceAccountKey };
  }
  return cached.key;
}

export const issuerId = () => requireEnv("GOOGLE_WALLET_ISSUER_ID");

/** Base dell'API Wallet; GOOGLE_WALLET_API_BASE serve solo ai test (API simulata). */
export const apiBase = () =>
  (optionalEnv("GOOGLE_WALLET_API_BASE") ?? "https://walletobjects.googleapis.com/walletobjects/v1").replace(/\/$/, "");

// Gli id Google sono "<issuerId>.<suffisso>" con suffisso [A-Za-z0-9._-]
export const classIdFor = (slug: string) => `${issuerId()}.shop-${slug}`;
export const objectIdFor = (customerId: string) => `${issuerId()}.cust-${customerId}`;

/** Logo del template se il negozio non ne ha caricato uno (Google lo richiede, PNG/JPEG pubblico). */
export const defaultLogoUrl = () =>
  optionalEnv("CARD_DEFAULT_LOGO_URL") ?? `${requireEnv("APP_BASE_URL").replace(/\/$/, "")}/brand/logo-predefinito.png`;
