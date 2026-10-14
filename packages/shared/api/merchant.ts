import { z } from "zod";
import { CardView, CustomerIdBody, HexColor, IdParams, Role, ShortCode, UserIdParams } from "./common";

/*
 * Contratti delle API dell'app esercente (/api/v1/merchant/*): richiesta e risposta di
 * ogni endpoint. Usati dal backend (validazione, OpenAPI, test) e dall'app (client tipizzato).
 */

/* ---------- utente e negozi ---------- */

export const Membership = z.object({
  shopId: z.uuid(),
  shopName: z.string(),
  slug: z.string(),
  role: Role,
  displayName: z.string(),
});
export const MeResponse = z.object({
  user: z.object({ id: z.uuid(), email: z.string().nullable() }),
  memberships: z.array(Membership),
});

export const ShopSummary = z.object({
  id: z.uuid(),
  name: z.string(),
  slug: z.string(),
  role: Role,
  hexColor: HexColor,
  logoUrl: z.string().nullable(),
  stampsRequired: z.number().int(),
  rewardLabel: z.string(),
  status: z.enum(["active", "suspended"]),
});
export const ShopsResponse = z.object({ shops: z.array(ShopSummary) });

/* ---------- scansione e timbri ---------- */

/** QR (32 caratteri esadecimali) oppure codice breve digitato (8 caratteri, maiuscole o minuscole). */
export const LookupBody = z.object({
  code: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .refine((s) => /^[0-9a-f]{32}$/.test(s) || ShortCode.safeParse(s.toUpperCase()).success, {
      message: "non è un QR della carta né un codice breve",
    }),
});
export const CardResponse = z.object({
  card: CardView,
  /** Data d'iscrizione (ISO) e numero di timbri ricevuti in tutto: "Cliente da marzo · 17 visite". */
  since: z.string(),
  visits: z.number().int().min(0),
});
/** Risposta delle azioni che restituiscono solo la carta aggiornata (annullamento, riscatto). */
export const CardOnlyResponse = z.object({ card: CardView });
/** Timbro: `force` lo dà anche durante il cooldown (resta nell'audit con chi l'ha dato). */
export const StampBody = CustomerIdBody.extend({ force: z.literal(true).optional() });
export const StampResponse = z.object({
  card: CardView,
  rewardUnlocked: z.boolean(),
  /** true se è stato forzato durante il cooldown. */
  forced: z.boolean(),
});
export { CustomerIdBody };

/* ---------- statistiche ---------- */

export const WeekStats = z.object({
  weekStart: z.string(),
  stamps: z.number().int(),
  redeems: z.number().int(),
  enrollments: z.number().int(),
});
export const StatsResponse = z.object({
  customersTotal: z.number().int(),
  customersMarketing: z.number().int(),
  inactive60Days: z.number().int(),
  thisWeek: WeekStats,
  weeks: z.array(WeekStats).length(8),
});

/* ---------- clienti ---------- */

export const CustomersQuery = z.object({
  q: z.string().trim().max(80).optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
export const CustomerItem = z.object({
  id: z.uuid(),
  shortCode: ShortCode,
  name: z.string(),
  /** Sempre mascherato: +39 333 ***4567. */
  phoneMasked: z.string().nullable(),
  stamps: z.number().int(),
  rewardsAvailable: z.number().int(),
  consentMarketing: z.boolean(),
  createdAt: z.string(),
});
export const CustomersResponse = z.object({ items: z.array(CustomerItem), nextCursor: z.string().nullable() });

export const HistoryEntry = z.object({
  at: z.string(),
  /** enroll, stamp, undo, redeem, adjust, marketing_consent, … */
  action: z.string(),
  actorName: z.string(),
  before: z.record(z.string(), z.unknown()).nullable(),
  after: z.record(z.string(), z.unknown()).nullable(),
  reason: z.string().nullable(),
});
export const CustomerDetailResponse = z.object({
  customer: CustomerItem.extend({ stampsRequired: z.number().int(), rewardLabel: z.string() }),
  history: z.array(HistoryEntry),
});
export { IdParams };

export const AdjustBody = z.object({
  stamps: z.number().int().min(0).max(49),
  rewards: z.number().int().min(0).max(99),
  reason: z.string().trim().min(5, "il motivo è obbligatorio (almeno 5 caratteri)").max(200),
});
export const DeleteCustomerBody = z.object({ reason: z.string().trim().max(200).optional() }).default({});
export const DeleteCustomerResponse = z.object({ deleted: z.literal(true), shortCode: ShortCode });
export const MarketingBody = z.object({ consent: z.boolean() });
export const MarketingResponse = z.object({ changed: z.boolean(), consentMarketing: z.boolean() });

/* ---------- impostazioni ---------- */

export const ShopSettings = z.object({
  name: z.string(),
  slug: z.string(),
  hexColor: HexColor,
  stampsRequired: z.number().int(),
  rewardLabel: z.string(),
  stampCooldownMinutes: z.number().int(),
  logoUrl: z.string().nullable(),
  legalName: z.string().nullable(),
  vatNumber: z.string().nullable(),
  privacyEmail: z.string().nullable(),
  status: z.enum(["active", "suspended"]),
  /** Testi della carta nel Wallet: "Carta Amica", "taglio" / "tagli" ("Ti mancano 4 tagli"). */
  programName: z.string(),
  stampUnit: z.string(),
  stampUnitPlural: z.string(),
});
export const SettingsResponse = z.object({ settings: ShopSettings });
export const SettingsUpdateBody = z
  .object({
    name: z.string().trim().min(2).max(60),
    hexColor: HexColor,
    stampsRequired: z.number().int().min(2).max(50),
    rewardLabel: z.string().trim().min(2).max(40),
    stampCooldownMinutes: z.number().int().min(0).max(1440),
    /** Percorso restituito da logo-upload-url, dopo aver caricato il file. */
    logoPath: z.string().max(200),
    legalName: z.string().trim().max(120).nullable(),
    vatNumber: z
      .string()
      .trim()
      .regex(/^(IT)?\d{11}$/, "partita IVA non valida")
      .nullable(),
    privacyEmail: z.email().nullable(),
    programName: z.string().trim().min(2).max(40),
    stampUnit: z.string().trim().min(2).max(20),
    stampUnitPlural: z.string().trim().min(2).max(20),
  })
  .partial()
  .refine((o) => Object.keys(o).length > 0, { message: "nessun campo da aggiornare" });

export const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export const LOGO_MAX_BYTES = 2 * 1024 * 1024;
export const LogoUploadBody = z.object({
  contentType: z.string().max(100),
  sizeBytes: z.number().int().positive(),
});
export const LogoUploadResponse = z.object({
  uploadUrl: z.string(),
  token: z.string(),
  path: z.string(),
});

/* ---------- staff ---------- */

export const StaffMember = z.object({
  userId: z.uuid(),
  displayName: z.string(),
  email: z.string().nullable(),
  role: Role,
});
export const StaffListResponse = z.object({ staff: z.array(StaffMember) });
export const StaffInviteBody = z.object({
  email: z.email(),
  displayName: z.string().trim().min(2).max(40),
  role: Role,
});
export const StaffInviteResponse = z.object({ member: StaffMember, existingAccount: z.boolean() });
export const StaffUpdateBody = z
  .object({ role: Role, displayName: z.string().trim().min(2).max(40) })
  .partial()
  .refine((o) => Object.keys(o).length > 0, { message: "nessun campo da aggiornare" });
export const StaffMemberResponse = z.object({ member: StaffMember });
export const StaffRemoveResponse = z.object({ removed: z.literal(true) });
export { UserIdParams };

/* ---------- promozioni ---------- */

export const PromotionBody = z.object({ text: z.string().trim().min(1).max(140) });
export const Promotion = z.object({
  id: z.uuid(),
  text: z.string(),
  status: z.enum(["queued", "sending", "sent", "cancelled"]),
  recipients: z.number().int(),
  createdAt: z.string(),
});
export const PromotionResponse = z.object({ promotion: Promotion });
export const PromotionsResponse = z.object({ promotions: z.array(Promotion) });

/* ---------- diagnostica ---------- */

export const DIAGNOSTICS_MAX_BYTES = 256 * 1024;
export const DiagnosticsBody = z.object({
  /** Modello, sistema operativo, versione app, permessi, lingua, fuso orario, tipo di scanner… */
  device: z.record(z.string(), z.unknown()),
  /** Buffer degli ultimi eventi dell'app (al massimo 1000). */
  events: z.array(z.record(z.string(), z.unknown())).max(1000),
  note: z.string().trim().max(500).optional(),
});
export const DiagnosticsResponse = z.object({ ticketCode: z.string() });
