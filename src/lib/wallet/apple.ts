import "server-only";
import { optionalEnv } from "../env";
import type { CardState } from "../types";

/**
 * Modulo Apple Wallet — PREDISPOSTO, NON ATTIVO.
 *
 * Si attiva quando ci sono APPLE_PASS_TYPE_ID e APPLE_TEAM_ID
 * (richiede Apple Developer Program, 99 €/anno). Cosa manca:
 *  1. `npm i passkit-generator` e certificati (signerCert, signerKey, wwdr)
 *  2. generare il .pkpass in `buildPass()` partendo da `passJson()`
 *  3. web service Apple (route sotto /api/apple/v1/...):
 *       POST/DELETE devices/{deviceId}/registrations/{passTypeId}/{serial}
 *       GET  devices/{deviceId}/registrations/{passTypeId}
 *       GET  passes/{passTypeId}/{serial}
 *     salvando i push token in `apple_registrations`
 *  4. `notify()`: push APNs vuota a ogni push token del cliente
 */
export function appleEnabled(): boolean {
  return Boolean(optionalEnv("APPLE_PASS_TYPE_ID") && optionalEnv("APPLE_TEAM_ID"));
}

/** pass.json per lo stile storeCard, già pronto per passkit-generator. */
export function passJson({ shop, customer }: CardState, authenticationToken: string) {
  return {
    formatVersion: 1,
    passTypeIdentifier: optionalEnv("APPLE_PASS_TYPE_ID"),
    teamIdentifier: optionalEnv("APPLE_TEAM_ID"),
    serialNumber: customer.id,
    organizationName: shop.name,
    description: `${shop.name} – Carta fedeltà`,
    backgroundColor: shop.hex_color,
    foregroundColor: "#ffffff",
    labelColor: "#e5e7eb",
    webServiceURL: `${optionalEnv("APP_BASE_URL")}/api/apple`,
    authenticationToken,
    barcodes: [{ format: "PKBarcodeFormatQR", message: customer.qr_token, messageEncoding: "iso-8859-1" }],
    storeCard: {
      primaryFields: [
        {
          key: "stamps",
          label: "Timbri",
          value: `${customer.stamps} / ${shop.stamps_required}`,
          changeMessage: "Ora hai %@ timbri",
        },
      ],
      secondaryFields: [
        {
          key: "rewards",
          label: "Premi",
          value: customer.rewards_available,
          changeMessage: `Hai %@ premi disponibili: ${shop.reward_label}!`,
        },
      ],
      auxiliaryFields: [{ key: "name", label: "Cliente", value: customer.name }],
      backFields: [
        { key: "rules", label: "Regolamento", value: `Ogni ${shop.stamps_required} timbri: ${shop.reward_label}.` },
      ],
    },
  };
}

/** Push APNs ai dispositivi del cliente. No-op finché Apple non è attivo. */
export async function notifyApple(_state: CardState): Promise<void> {
  if (!appleEnabled()) return;
  // TODO: leggere apple_registrations per customer.id e inviare push APNs vuota
  throw new Error("Apple Wallet: notify non ancora implementato");
}
