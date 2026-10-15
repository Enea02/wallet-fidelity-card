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
