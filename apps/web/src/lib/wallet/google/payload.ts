import "server-only";
import jwt from "jsonwebtoken";
import { requireEnv } from "../../env";
import type { Customer, Shop } from "../../types";
import { cardTexts, pointsTexts } from "../card-texts";
import { classIdFor, defaultLogoUrl, objectIdFor, serviceAccount } from "./config";

/*
 * LoyaltyClass (template del negozio) e LoyaltyObject (carta del cliente) inviati a Google.
 * Sempre lo stato completo: la sincronizzazione è idempotente, mai incrementi.
 */

export type GoogleCardState = "ACTIVE" | "INACTIVE";

/** Carta utilizzabile solo se il cliente esiste e il negozio è attivo. */
export const cardStateFor = (shop: Shop, customer: Customer): GoogleCardState =>
  customer.deleted_at === null && shop.status === "active" ? "ACTIVE" : "INACTIVE";

const privacyUrl = (shop: Shop) => `${requireEnv("APP_BASE_URL").replace(/\/$/, "")}/${shop.slug}/privacy`;

export function classBody(shop: Shop) {
  return {
    id: classIdFor(shop.slug),
    issuerName: shop.name,
    programName: shop.program_name,
    countryCode: "IT",
    hexBackgroundColor: shop.hex_color,
    reviewStatus: "UNDER_REVIEW",
    programLogo: {
      sourceUri: { uri: shop.logo_url ?? defaultLogoUrl() },
      contentDescription: { defaultValue: { language: "it-IT", value: shop.name } },
    },
  };
}

export function objectBody(shop: Shop, customer: Customer) {
  if (shop.loyalty_mode === "punti") return pointsObjectBody(shop, customer);
  const t = cardTexts(shop, customer);
  return {
    id: objectIdFor(customer.id),
    classId: classIdFor(shop.slug),
    state: cardStateFor(shop, customer),
    accountId: customer.short_code,
    accountName: customer.name,
    loyaltyPoints: { label: "Timbri", balance: { string: t.stamps } },
    secondaryLoyaltyPoints: { label: "Premi", balance: { string: t.rewards } },
    barcode: { type: "QR_CODE", value: customer.qr_token, alternateText: customer.short_code },
    textModulesData: [
      { id: "stato", header: t.module.header, body: t.module.body },
      { id: "regolamento", header: "Regolamento", body: t.rules },
      { id: "privacy", header: "Privacy", body: t.privacy },
    ],
    linksModuleData: { uris: [{ id: "informativa", uri: privacyUrl(shop), description: "Informativa privacy" }] },
  };
}

/** Carta a punti (Fase 9.6): stesso LoyaltyObject, con punti e livello al posto di timbri e premi. */
function pointsObjectBody(shop: Shop, customer: Customer) {
  const t = pointsTexts(shop, customer);
  return {
    id: objectIdFor(customer.id),
    classId: classIdFor(shop.slug),
    state: cardStateFor(shop, customer),
    accountId: customer.short_code,
    accountName: customer.name,
    loyaltyPoints: { label: "Punti", balance: { string: t.points } },
    secondaryLoyaltyPoints: { label: "Livello", balance: { string: t.level } },
    barcode: { type: "QR_CODE", value: customer.qr_token, alternateText: customer.short_code },
    textModulesData: [
      { id: "stato", header: t.module.header, body: t.module.body },
      { id: "regolamento", header: "Regolamento", body: t.rules },
      { id: "privacy", header: "Privacy", body: t.privacy },
    ],
    linksModuleData: { uris: [{ id: "informativa", uri: privacyUrl(shop), description: "Informativa privacy" }] },
  };
}

/**
 * Link "Salva in Google Wallet": il JWT contiene template e carta COMPLETI, così Google li crea
 * al salvataggio anche se la nostra chiamata di creazione non è ancora riuscita.
 */
export function saveUrl(shop: Shop, customer: Customer): string {
  const sa = serviceAccount();
  const token = jwt.sign(
    {
      iss: sa.client_email,
      aud: "google",
      typ: "savetowallet",
      origins: [requireEnv("APP_BASE_URL")],
      payload: { loyaltyClasses: [classBody(shop)], loyaltyObjects: [objectBody(shop, customer)] },
    },
    sa.private_key,
    { algorithm: "RS256" },
  );
  return `https://pay.google.com/gp/v/save/${token}`;
}
