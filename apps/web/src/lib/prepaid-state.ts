import type { PrepaidState, PrepaidView } from "@loyalty/shared/api";
import type { PrepaidCard, PrepaidProduct } from "./types";

/** Stato della tessera, come _prepaid_state nel database: da attivare, attiva, esaurita, scaduta. */
export function prepaidState(
  c: Pick<PrepaidCard, "status" | "balance" | "expires_at">,
  now = Date.now(),
): PrepaidState {
  if (c.status === "pending") return "da_attivare";
  if (c.expires_at && new Date(c.expires_at).getTime() <= now) return "scaduta";
  if (c.balance === 0) return "esaurita";
  return "attiva";
}

/** Tessera come la vede lo staff (contratto PrepaidView): niente telefono, niente QR. */
export function prepaidView(c: PrepaidCard, p: PrepaidProduct, personName: string): PrepaidView {
  return {
    id: c.id,
    shortCode: c.short_code,
    name: personName,
    productId: p.id,
    productName: p.name,
    unitSingular: p.unit_singular,
    unitPlural: p.unit_plural,
    units: p.units,
    state: prepaidState(c),
    balance: c.balance,
    chargedUnits: c.charged_units,
    activatedAt: c.activated_at ? new Date(c.activated_at).toISOString() : null,
    expiresAt: c.expires_at ? new Date(c.expires_at).toISOString() : null,
  };
}
