import { z } from "zod";

/*
 * Contratti delle API del web pubblico (/api/public/*): iscrizione con verifica del telefono,
 * funnel e disiscrizione. Nessun dato personale in URL: tutto nel body.
 */

export const OtpCode = z.string().regex(/^\d{6}$/, "il codice è di 6 cifre");

export const EnrollStartBody = z.object({
  shopSlug: z.string().min(3).max(40),
  name: z.string().trim().min(2, "scrivi il tuo nome").max(60),
  phone: z.string().trim().min(1).max(30),
  /** Prefisso del campo separato (design: "+39 modificabile"). */
  phonePrefix: z.string().trim().max(5).default("+39"),
  consentPrivacy: z.literal(true, { error: "senza consenso non possiamo creare la carta" }),
  consentMarketing: z.boolean().default(false),
  /** Token di Cloudflare Turnstile. */
  captchaToken: z.string().min(1).max(4096),
});
export const EnrollStartResponse = z.object({
  enrollmentId: z.uuid(),
  phoneDisplay: z.string(),
  resendInSeconds: z.number().int(),
});

export const EnrollmentIdBody = z.object({ enrollmentId: z.uuid() });
export const EnrollResendResponse = z.object({ resendInSeconds: z.number().int() });

export const EnrollVerifyBody = z.object({ enrollmentId: z.uuid(), code: OtpCode });

/** Carta come la vede il cliente appena iscritto (è la sua: niente dati di altri). */
export const PublicCard = z.object({
  shortCode: z.string(),
  qrToken: z.string(),
  stamps: z.number().int(),
  stampsRequired: z.number().int(),
  rewardsAvailable: z.number().int(),
  rewardLabel: z.string(),
});
export const EnrollVerifyResponse = z.object({
  status: z.enum(["created", "returning"]),
  firstName: z.string(),
  card: PublicCard,
  /** Link "Salva in Google Wallet" (null se Google Wallet non è configurato). */
  googleSaveUrl: z.string().nullable(),
  /** Link breve firmato da aprire sul telefono (QR mostrato sul computer). */
  phoneLink: z.string(),
});

export const FunnelBody = z.object({
  enrollmentId: z.uuid(),
  step: z.enum(["link.shown", "link.clicked"]),
  wallet: z.enum(["google", "apple-in-arrivo", "qr-da-computer"]),
});

export const UnsubscribeBody = z.object({ token: z.string().min(10).max(500) });
export const UnsubscribeResponse = z.object({
  status: z.enum(["done", "already"]),
  shopName: z.string(),
});
