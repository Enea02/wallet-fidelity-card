import "server-only";
import { prepaidBalance, prepaidDate, prepaidModule, prepaidUnits } from "@loyalty/shared/copy";
import jwt from "jsonwebtoken";
import { requireEnv } from "../../env";
import { prepaidState } from "../../prepaid-state";
import type { PrepaidCard, PrepaidProduct, Shop } from "../../types";
import { defaultLogoUrl, issuerId, serviceAccount } from "./config";
import type { GoogleCardState } from "./payload";

/*
 * Tessera prepagata su Google Wallet (Fase 9.5): un LoyaltyClass per tipo di tessera, con nome,
 * colore e logo del negozio; un LoyaltyObject per tessera con lo stato completo (saldo, stato,
 * scadenza come validità della carta). Stessi testi dell'app (@loyalty/shared/copy).
 */

// id Google: "<issuerId>.<suffisso>" con suffisso [A-Za-z0-9._-]
export const prepaidClassIdFor = (shop: Pick<Shop, "slug">, product: Pick<PrepaidProduct, "code">) =>
  `${issuerId()}.shop-${shop.slug}-t-${product.code}`;
export const prepaidObjectIdFor = (cardId: string) => `${issuerId()}.prepaid-${cardId}`;

/** Utilizzabile se la tessera esiste e il negozio è attivo (lo stato "da attivare" lo dice il testo). */
export const prepaidCardStateFor = (shop: Shop, card: PrepaidCard): GoogleCardState =>
  card.deleted_at === null && shop.status === "active" ? "ACTIVE" : "INACTIVE";

/** Stato sincronizzato ("ACTIVE:attiva"): cambia quando cambia lo stato su Google o quello della tessera. */
export const prepaidSyncedState = (shop: Shop, card: PrepaidCard) =>
  `${prepaidCardStateFor(shop, card)}:${prepaidState(card)}`;

const privacyUrl = (shop: Shop) => `${requireEnv("APP_BASE_URL").replace(/\/$/, "")}/${shop.slug}/privacy`;

export function prepaidClassBody(shop: Shop, product: PrepaidProduct) {
  return {
    id: prepaidClassIdFor(shop, product),
    issuerName: shop.name,
    programName: product.name,
    countryCode: "IT",
    hexBackgroundColor: shop.hex_color,
    reviewStatus: "UNDER_REVIEW",
    programLogo: {
      sourceUri: { uri: shop.logo_url ?? defaultLogoUrl() },
      contentDescription: { defaultValue: { language: "it-IT", value: shop.name } },
    },
  };
}

export function prepaidTexts(shop: Shop, product: PrepaidProduct, card: PrepaidCard) {
  const state = prepaidState(card);
  const input = {
    state,
    balance: card.balance,
    chargedUnits: card.charged_units,
    units: product.units,
    unitSingular: product.unit_singular,
    unitPlural: product.unit_plural,
    expiresAt: card.expires_at,
  };
  const validity = product.validity_months
    ? `• Valida ${product.validity_months} mesi dall'attivazione o dall'ultima ricarica.`
    : "• Senza scadenza.";
  const rules = [
    `• ${prepaidUnits(input, product.units)} per ogni tessera o ricarica, pagata in negozio.`,
    "• A ogni utilizzo il negozio scala le unità usate mostrando il QR in cassa.",
    validity,
    "• Non rimborsabile, non convertibile in denaro.",
  ].join("\n");
  const holder = shop.legal_name ?? shop.name;
  const privacy = shop.privacy_email
    ? `Dati trattati da ${holder}. Per esercitare i tuoi diritti scrivi a ${shop.privacy_email}.`
    : `Dati trattati da ${holder}. Per esercitare i tuoi diritti chiedi in negozio.`;
  return {
    balance: prepaidBalance(input),
    expires: card.expires_at ? prepaidDate(card.expires_at) : "nessuna",
    module: prepaidModule(input),
    rules,
    privacy,
  };
}

export function prepaidObjectBody(shop: Shop, product: PrepaidProduct, card: PrepaidCard, personName: string) {
  const t = prepaidTexts(shop, product, card);
  const unitsLabel = product.unit_plural.charAt(0).toUpperCase() + product.unit_plural.slice(1);
  return {
    id: prepaidObjectIdFor(card.id),
    classId: prepaidClassIdFor(shop, product),
    state: prepaidCardStateFor(shop, card),
    accountId: card.short_code,
    accountName: personName,
    loyaltyPoints: { label: unitsLabel, balance: { string: t.balance } },
    secondaryLoyaltyPoints: { label: "Scadenza", balance: { string: t.expires } },
    barcode: { type: "QR_CODE", value: card.qr_token, alternateText: card.short_code },
    // con la scadenza Google mostra la tessera come scaduta da solo
    ...(card.expires_at && { validTimeInterval: { end: { date: new Date(card.expires_at).toISOString() } } }),
    textModulesData: [
      { id: "stato", header: t.module.header, body: t.module.body },
      { id: "regolamento", header: "Regolamento", body: t.rules },
      { id: "privacy", header: "Privacy", body: t.privacy },
    ],
    linksModuleData: { uris: [{ id: "informativa", uri: privacyUrl(shop), description: "Informativa privacy" }] },
  };
}

/** Link "Salva in Google Wallet" della tessera: template e carta completi nel JWT. */
export function prepaidSaveUrl(shop: Shop, product: PrepaidProduct, card: PrepaidCard, personName: string): string {
  const sa = serviceAccount();
  const token = jwt.sign(
    {
      iss: sa.client_email,
      aud: "google",
      typ: "savetowallet",
      origins: [requireEnv("APP_BASE_URL")],
      payload: {
        loyaltyClasses: [prepaidClassBody(shop, product)],
        loyaltyObjects: [prepaidObjectBody(shop, product, card, personName)],
      },
    },
    sa.private_key,
    { algorithm: "RS256" },
  );
  return `https://pay.google.com/gp/v/save/${token}`;
}
