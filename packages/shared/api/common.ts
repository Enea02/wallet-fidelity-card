import { z } from "zod";

/** Header comuni delle API esercente (stessi nomi su app, backend e log). */
export const HEADERS = {
  requestId: "x-request-id",
  platform: "x-platform",
  appVersion: "x-app-version",
  appBuild: "x-app-build",
  /** Negozio su cui si opera: obbligatorio per le API di un negozio. */
  shopId: "x-shop-id",
  /** UUID di un tocco su timbro, annullamento o riscatto: la stessa chiave non agisce due volte. */
  idempotencyKey: "idempotency-key",
} as const;

export const Platform = z.enum(["ios", "android", "web"]);

/** Risposta d'errore di tutte le API: `code` dal catalogo, `support_code` da comunicare all'assistenza. */
export const ErrorBody = z.object({
  error: z.object({ code: z.string(), message: z.string(), support_code: z.string() }),
});
export type ErrorBody = z.infer<typeof ErrorBody>;

export const Role = z.enum(["owner", "operator"]);
export type Role = z.infer<typeof Role>;

/** Codice breve della carta: 8 caratteri, niente 0/O/1/I/L. */
export const ShortCode = z.string().regex(/^[2-9A-HJKMNP-Z]{8}$/, "codice breve non valido");

/** Icone dei timbri (packages/shared/theme.ts, STAMP_ICONS). */
export const StampIconName = z.enum(["scissors", "cup", "pizza", "sparkle", "gift", "check"]);

export const HexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "colore non valido (formato #RRGGBB)");

/** Carta come la vede lo staff: niente telefono, niente QR. */
export const CardView = z.object({
  id: z.uuid(),
  shortCode: ShortCode,
  name: z.string(),
  stamps: z.number().int().min(0),
  stampsRequired: z.number().int().min(2),
  rewardsAvailable: z.number().int().min(0),
  rewardLabel: z.string(),
});
export type CardView = z.infer<typeof CardView>;

export const CustomerIdBody = z.object({ customerId: z.uuid() });
export const IdParams = z.object({ id: z.uuid() });
export const UserIdParams = z.object({ userId: z.uuid() });

/** Stato della tessera prepagata: da attivare (non pagata), attiva, esaurita (0 unità), scaduta. */
export const PrepaidState = z.enum(["da_attivare", "attiva", "esaurita", "scaduta"]);
export type PrepaidState = z.infer<typeof PrepaidState>;

/** Tessera prepagata come la vede lo staff: niente telefono, niente QR. */
export const PrepaidView = z.object({
  id: z.uuid(),
  shortCode: ShortCode,
  /** Nome del cliente. */
  name: z.string(),
  productId: z.uuid(),
  productName: z.string(),
  /** "abbonamento": membership con vantaggio e scadenza, senza unità (Fase 9.6). */
  kind: z.enum(["consumo", "abbonamento"]),
  benefit: z.string().nullable(),
  unitSingular: z.string().nullable(),
  unitPlural: z.string().nullable(),
  /** Unità aggiunte da un'attivazione o una ricarica (null per l'abbonamento). */
  units: z.number().int().min(1).nullable(),
  state: PrepaidState,
  balance: z.number().int().min(0),
  /** Saldo dopo l'ultima attivazione o ricarica ("138 di 150"). */
  chargedUnits: z.number().int().min(0),
  activatedAt: z.string().nullable(),
  expiresAt: z.string().nullable(),
});
export type PrepaidView = z.infer<typeof PrepaidView>;
export const CardIdBody = z.object({ cardId: z.uuid() });

/** Livello della carta a punti (Fase 9.6). */
export const PointsLevel = z.object({
  name: z.string().trim().min(2).max(20),
  min: z.number().int().min(0).max(10_000_000),
  perk: z.string().trim().max(80),
});

/** Carta a punti come la vede lo staff (Fase 9.6). */
export const PointsView = z.object({
  id: z.uuid(),
  shortCode: ShortCode,
  name: z.string(),
  points: z.number().int().min(0),
  pointsTotal: z.number().int().min(0),
  level: z.string(),
  perk: z.string(),
  nextLevel: z.string().nullable(),
  toNext: z.number().int().min(0),
  pointsPerEuro: z.number().int(),
  minCents: z.number().int(),
});
export type PointsView = z.infer<typeof PointsView>;
