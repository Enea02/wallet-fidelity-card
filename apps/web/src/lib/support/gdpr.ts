import "server-only";
import { AppError } from "@loyalty/shared/errors";
import { deleteCustomer } from "../loyalty";
import { callDomain, domainMeta } from "../merchant/domain-call";
import { setContext } from "../observability/context";
import { log } from "../observability/logger";
import type { SupportUser } from "./session";

/*
 * GDPR dal pannello: esportazione dei dati di un cliente (JSON da inviare all'interessato) e
 * cancellazione su richiesta. Entrambe chiedono il motivo e restano in audit_log come support.
 */

function requireReason(reason: string) {
  if (reason.trim().length < 5) {
    throw new AppError(
      "E_VALIDATION",
      "motivo della richiesta GDPR mancante",
      { fields: ["reason"] },
      {
        userMessage: "Scrivi il motivo (es. «richiesta via email del 03/11»): resta nello storico.",
      },
    );
  }
}

export async function exportCustomer(customerId: string, reason: string, user: SupportUser) {
  requireReason(reason);
  const data = await callDomain<Record<string, unknown> & { _meta: { short_code: string; shop_name: string } }>(
    "support_customer_export",
    {
      p_customer_id: customerId,
      p_meta: { ...domainMeta({ type: "support", name: user.name }), reason: reason.trim() },
    },
  );
  const { _meta, ...payload } = data;
  setContext({ customer_ref: _meta.short_code });
  const body = JSON.stringify(
    { esportato_il: new Date().toISOString(), formato: "Loyalty Wallet · dati del cliente (GDPR art. 15)", ...payload },
    null,
    2,
  );
  log.event("support.customer.export", {
    support_name: user.name,
    customer_ref: _meta.short_code,
    shop_name: _meta.shop_name,
    size_bytes: Buffer.byteLength(body),
    reason: reason.trim(),
  });
  return { body, filename: `dati-carta-${_meta.short_code}.json` };
}

export async function deleteCustomerGdpr(
  shopId: string,
  customerId: string,
  confirmCode: string,
  shortCode: string,
  reason: string,
  user: SupportUser,
) {
  requireReason(reason);
  if (confirmCode.trim().toUpperCase() !== shortCode) {
    throw new AppError(
      "E_VALIDATION",
      "codice di conferma della cancellazione diverso dal codice della carta",
      {
        fields: ["confirm"],
      },
      { userMessage: "Per confermare scrivi esattamente il codice della carta." },
    );
  }
  return deleteCustomer(shopId, customerId, { type: "support", name: user.name }, reason.trim());
}
