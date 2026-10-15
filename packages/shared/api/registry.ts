import type { z } from "zod";
import * as m from "./merchant";

/**
 * Registro delle API esercente: un'unica fonte per route, validazione,
 * documentazione OpenAPI, matrice dei permessi nei test e client dell'app.
 *
 * - auth "user": basta essere autenticati (nessun negozio);
 * - auth "staff": serve X-Shop-Id e appartenere allo staff del negozio;
 * - auth "owner": come staff, ma solo il titolare.
 */
export interface EndpointDef {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  summary: string;
  auth: "user" | "staff" | "owner";
  params?: z.ZodType;
  query?: z.ZodType;
  body?: z.ZodType;
  /** Schema della risposta JSON, oppure "pdf" per una risposta binaria. */
  response: z.ZodType | "pdf";
  /** Limite del body in byte (default 64 KB). */
  maxBodyBytes?: number;
  /** Azione sul saldo: header Idempotency-Key obbligatorio, la stessa chiave non agisce due volte. */
  idempotent?: true;
}

const BASE = "/api/v1/merchant";
const def = <D extends EndpointDef>(d: D) => ({ ...d, path: `${BASE}${d.path}` });

export const merchantApi = {
  me: def({
    method: "GET",
    path: "/me",
    summary: "Utente e negozi a cui appartiene",
    auth: "user",
    response: m.MeResponse,
  }),
  shops: def({ method: "GET", path: "/shops", summary: "Negozi dell'utente", auth: "user", response: m.ShopsResponse }),

  lookup: def({
    method: "POST",
    path: "/scan/lookup",
    summary: "Carta da QR o codice breve",
    auth: "staff",
    body: m.LookupBody,
    response: m.CardResponse,
  }),
  stamp: def({
    method: "POST",
    path: "/stamp",
    summary: "Aggiunge un timbro",
    auth: "staff",
    body: m.StampBody,
    response: m.StampResponse,
    idempotent: true,
  }),
  undo: def({
    method: "POST",
    path: "/undo",
    summary: "Annulla l'ultimo timbro",
    auth: "staff",
    body: m.CustomerIdBody,
    response: m.CardOnlyResponse,
    idempotent: true,
  }),
  redeem: def({
    method: "POST",
    path: "/redeem",
    summary: "Riscatta un premio",
    auth: "staff",
    body: m.CustomerIdBody,
    response: m.CardOnlyResponse,
    idempotent: true,
  }),

  stats: def({
    method: "GET",
    path: "/stats",
    summary: "Statistiche del negozio",
    auth: "owner",
    response: m.StatsResponse,
  }),

  customers: def({
    method: "GET",
    path: "/customers",
    summary: "Lista e ricerca clienti",
    auth: "owner",
    query: m.CustomersQuery,
    response: m.CustomersResponse,
  }),
  customer: def({
    method: "GET",
    path: "/customers/{id}",
    summary: "Dettaglio cliente con storico",
    auth: "owner",
    params: m.IdParams,
    response: m.CustomerDetailResponse,
  }),
  adjust: def({
    method: "POST",
    path: "/customers/{id}/adjust",
    summary: "Rettifica timbri e premi",
    auth: "owner",
    params: m.IdParams,
    body: m.AdjustBody,
    response: m.CardOnlyResponse,
  }),
  deleteCustomer: def({
    method: "DELETE",
    path: "/customers/{id}",
    summary: "Cancella i dati del cliente",
    auth: "owner",
    params: m.IdParams,
    body: m.DeleteCustomerBody,
    response: m.DeleteCustomerResponse,
  }),
  marketing: def({
    method: "POST",
    path: "/customers/{id}/marketing",
    summary: "Consenso alle promozioni",
    auth: "owner",
    params: m.IdParams,
    body: m.MarketingBody,
    response: m.MarketingResponse,
  }),

  settings: def({
    method: "GET",
    path: "/shop-settings",
    summary: "Impostazioni del negozio",
    auth: "owner",
    response: m.SettingsResponse,
  }),
  updateSettings: def({
    method: "PUT",
    path: "/shop-settings",
    summary: "Aggiorna le impostazioni",
    auth: "owner",
    body: m.SettingsUpdateBody,
    response: m.SettingsResponse,
  }),
  logoUploadUrl: def({
    method: "POST",
    path: "/shop-settings/logo-upload-url",
    summary: "URL firmato per caricare il logo",
    auth: "owner",
    body: m.LogoUploadBody,
    response: m.LogoUploadResponse,
  }),

  staff: def({
    method: "GET",
    path: "/staff",
    summary: "Staff del negozio",
    auth: "owner",
    response: m.StaffListResponse,
  }),
  invite: def({
    method: "POST",
    path: "/staff/invite",
    summary: "Invita una persona nello staff",
    auth: "owner",
    body: m.StaffInviteBody,
    response: m.StaffInviteResponse,
  }),
  updateStaff: def({
    method: "PATCH",
    path: "/staff/{userId}",
    summary: "Cambia ruolo o nome",
    auth: "owner",
    params: m.UserIdParams,
    body: m.StaffUpdateBody,
    response: m.StaffMemberResponse,
  }),
  removeStaff: def({
    method: "DELETE",
    path: "/staff/{userId}",
    summary: "Rimuove dallo staff",
    auth: "owner",
    params: m.UserIdParams,
    response: m.StaffRemoveResponse,
  }),

  promotions: def({
    method: "GET",
    path: "/promotions",
    summary: "Storico promozioni",
    auth: "owner",
    response: m.PromotionsResponse,
  }),
  queuePromotion: def({
    method: "POST",
    path: "/promotions",
    summary: "Prenota l'invio di una promozione",
    auth: "owner",
    body: m.PromotionBody,
    response: m.PromotionResponse,
  }),

  counterQr: def({
    method: "GET",
    path: "/counter-qr.pdf",
    summary: "Cartello A5 con il QR",
    auth: "owner",
    response: "pdf",
  }),

  diagnostics: def({
    method: "POST",
    path: "/diagnostics",
    summary: "Invia diagnostica all'assistenza",
    auth: "staff",
    body: m.DiagnosticsBody,
    response: m.DiagnosticsResponse,
    maxBodyBytes: m.DIAGNOSTICS_MAX_BYTES,
  }),
} as const;

export type MerchantEndpoint = keyof typeof merchantApi;
