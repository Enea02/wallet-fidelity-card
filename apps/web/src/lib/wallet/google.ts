import "server-only";
import { GoogleAuth } from "google-auth-library";
import jwt from "jsonwebtoken";
import { optionalEnv, requireEnv } from "../env";
import type { CardState, Shop } from "../types";

const BASE = "https://walletobjects.googleapis.com/walletobjects/v1";
const SCOPE = "https://www.googleapis.com/auth/wallet_object.issuer";

/**
 * Google Wallet è attivo solo con Issuer ID e chiave del service account.
 * Senza (es. sviluppo locale) iscrizioni e timbri funzionano, ma nessuna carta Google.
 */
export function googleEnabled(): boolean {
  return Boolean(optionalEnv("GOOGLE_WALLET_ISSUER_ID") && optionalEnv("GOOGLE_WALLET_SA_KEY_B64"));
}

interface ServiceAccountKey {
  client_email: string;
  private_key: string;
}

let cachedKey: ServiceAccountKey | null = null;
function serviceAccount(): ServiceAccountKey {
  if (!cachedKey) {
    const raw = Buffer.from(requireEnv("GOOGLE_WALLET_SA_KEY_B64"), "base64").toString("utf8");
    cachedKey = JSON.parse(raw) as ServiceAccountKey;
  }
  return cachedKey;
}

let auth: GoogleAuth | null = null;
async function http() {
  if (!auth) auth = new GoogleAuth({ credentials: serviceAccount(), scopes: [SCOPE] });
  return auth.getClient();
}

function issuerId() {
  return requireEnv("GOOGLE_WALLET_ISSUER_ID");
}

// Gli id Google sono "<issuerId>.<suffisso>" con suffisso [A-Za-z0-9._-]
export const classIdFor = (shop: Shop) => `${issuerId()}.shop-${shop.slug}`;
export const objectIdFor = (customerId: string) => `${issuerId()}.cust-${customerId}`;

function status(e: unknown): number | undefined {
  return (e as { response?: { status?: number } })?.response?.status;
}

/** Crea o aggiorna il template del programma fedeltà del negozio. */
export async function upsertLoyaltyClass(shop: Shop) {
  const client = await http();
  const id = classIdFor(shop);
  const body = {
    id,
    issuerName: shop.name,
    programName: `${shop.name} – Carta fedeltà`,
    countryCode: "IT",
    hexBackgroundColor: shop.hex_color,
    reviewStatus: "UNDER_REVIEW",
    ...(shop.logo_url && {
      programLogo: {
        sourceUri: { uri: shop.logo_url },
        contentDescription: { defaultValue: { language: "it-IT", value: shop.name } },
      },
    }),
  };

  try {
    await client.request({ url: `${BASE}/loyaltyClass`, method: "POST", data: body });
  } catch (e) {
    if (status(e) !== 409) throw e;
    await client.request({ url: `${BASE}/loyaltyClass/${id}`, method: "PATCH", data: body });
  }
  return id;
}

function objectBody({ shop, customer }: CardState) {
  const hasReward = customer.rewards_available > 0;
  return {
    id: objectIdFor(customer.id),
    classId: classIdFor(shop),
    state: "ACTIVE",
    accountId: customer.short_code,
    accountName: customer.name,
    loyaltyPoints: {
      label: "Timbri",
      balance: { string: `${customer.stamps} / ${shop.stamps_required}` },
    },
    secondaryLoyaltyPoints: {
      label: "Premi",
      balance: { int: customer.rewards_available },
    },
    barcode: {
      type: "QR_CODE",
      value: customer.qr_token,
      // codice breve sotto il QR: lo staff può digitarlo se la scansione non va
      alternateText: customer.short_code,
    },
    textModulesData: [
      {
        id: "reward",
        header: hasReward ? `${shop.reward_label} disponibile!` : "Come funziona",
        body: hasReward
          ? "Mostra questa carta in cassa per riscattare il premio."
          : `Ogni ${shop.stamps_required} timbri: ${shop.reward_label.toLowerCase()}.`,
      },
    ],
  };
}

/** Crea la carta del cliente (o la riallinea se esiste già). */
export async function upsertLoyaltyObject(state: CardState) {
  const client = await http();
  const body = objectBody(state);
  try {
    await client.request({ url: `${BASE}/loyaltyObject`, method: "POST", data: body });
  } catch (e) {
    if (status(e) !== 409) throw e;
    await client.request({ url: `${BASE}/loyaltyObject/${body.id}`, method: "PATCH", data: body });
  }
  return body.id;
}

/** Aggiorna saldo e testi: Google propaga da solo ai telefoni. */
export async function patchLoyaltyObject(state: CardState) {
  const client = await http();
  const body = objectBody(state);
  await client.request({ url: `${BASE}/loyaltyObject/${body.id}`, method: "PATCH", data: body });
}

/**
 * Notifica push sul telefono (es. premio sbloccato).
 * Google limita le notifiche TEXT_AND_NOTIFY a poche al giorno per carta.
 */
export async function notifyLoyaltyObject(customerId: string, header: string, body: string) {
  const client = await http();
  const id = objectIdFor(customerId);
  await client.request({
    url: `${BASE}/loyaltyObject/${id}/addMessage`,
    method: "POST",
    data: {
      message: {
        id: `msg-${Date.now()}`,
        header,
        body,
        messageType: "TEXT_AND_NOTIFY",
      },
    },
  });
}

/** Link "Salva in Google Wallet" per una carta già creata. */
export function saveUrl(customerId: string, shop: Shop): string {
  const sa = serviceAccount();
  const token = jwt.sign(
    {
      iss: sa.client_email,
      aud: "google",
      typ: "savetowallet",
      origins: [requireEnv("APP_BASE_URL")],
      payload: {
        loyaltyObjects: [{ id: objectIdFor(customerId), classId: classIdFor(shop) }],
      },
    },
    sa.private_key,
    { algorithm: "RS256" },
  );
  return `https://pay.google.com/gp/v/save/${token}`;
}
