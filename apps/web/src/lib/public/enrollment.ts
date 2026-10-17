import "server-only";
import type { EnrollStartBody, EnrollVerifyResponse } from "@loyalty/shared/api";
import { AppError } from "@loyalty/shared/errors";
import { checkItalianMobile } from "@loyalty/shared/phone";
import type { z } from "zod";
import { fromDbError } from "../db-errors";
import { enroll, getShopBySlug } from "../loyalty";
import { getContext, setContext } from "../observability/context";
import { log } from "../observability/logger";
import { supabaseAdmin } from "../supabase";
import type { Shop } from "../types";
import { prepaidModule } from "@loyalty/shared/copy";
import { domainMeta } from "../merchant/domain-call";
import { getProductByCode } from "../prepaid";
import { prepaidState } from "../prepaid-state";
import { PREPAID_CARD_COLS, PREPAID_PRODUCT_COLS } from "../db-columns";
import type { PrepaidCard, PrepaidProduct } from "../types";
import { googleEnabled } from "../wallet/google/config";
import { prepaidSaveUrl } from "../wallet/google/prepaid-payload";
import { notifyPrepaidChanged } from "../wallet/notifier";
import { phoneHash, phoneLink, prepaidPhoneLink } from "./links";
import { otpProvider } from "./otp";
import { verifyCaptcha } from "./turnstile";

/*
 * Iscrizione dal web pubblico con verifica del telefono via SMS (Twilio Verify).
 * Funnel: form → anti-bot → limiti → SMS → codice → carta. Ogni passo ha il suo evento enroll.*,
 * tutte le righe hanno lo stesso enrollment_id. Nome e telefono mai nei log (telefono mascherato).
 */

const RESEND_S = 60;

function limits() {
  const n = (k: string, d: number) => {
    const v = Number(process.env[k]);
    return Number.isInteger(v) && v > 0 ? v : d;
  };
  return {
    per_number_hour: n("OTP_LIMIT_PER_NUMBER_HOUR", 3),
    per_number_day: n("OTP_LIMIT_PER_NUMBER_DAY", 5),
    per_ip_hour: n("OTP_LIMIT_PER_IP_HOUR", 10),
  };
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabaseAdmin().rpc(fn, args);
  if (error) throw fromDbError(error);
  return data as T;
}

const logged = (e: AppError) => Object.assign(e, { logged: true });

/** Negozio della pagina: inesistente o sospeso → errore (e riga del funnel). */
export async function shopForEnrollment(slug: string): Promise<Shop> {
  const shop = await getShopBySlug(slug);
  if (!shop || shop.status !== "active") {
    log.event("enroll.shop.unavailable", { slug, reason: shop ? "sospeso" : "inesistente" });
    throw logged(
      shop
        ? new AppError("E_SHOP_SUSPENDED", `il negozio ${slug} è sospeso`)
        : new AppError("E_SHOP_NOT_FOUND", `nessun negozio con slug "${slug}"`),
    );
  }
  setContext({ shop_id: shop.id });
  return shop;
}

/** Invia l'SMS; se il fornitore fallisce, l'invio non conta per i limiti. */
async function sendOtp(enrollmentId: string, shop: Shop, phone: string, sendNumber: number) {
  try {
    const { durationMs } = await otpProvider().send(phone);
    log.event("enroll.otp.sent", {
      enrollment_id: enrollmentId,
      shop_name: shop.name,
      phone,
      send_number: sendNumber,
      duration_ms: durationMs,
    });
  } catch (e) {
    if (!(e instanceof AppError)) throw e;
    await rpc("enrollment_send_failed", { p_id: enrollmentId });
    log.event("enroll.otp.send_failed", {
      enrollment_id: enrollmentId,
      shop_name: shop.name,
      http_status: typeof e.context.http_status === "number" ? e.context.http_status : null,
      error_code: "E_OTP_SEND_FAILED",
      provider_response: String(e.context.provider_response ?? e.message),
      duration_ms: Number(e.context.duration_ms ?? 0),
    });
    throw logged(new AppError("E_OTP_SEND_FAILED", `SMS non inviato: ${e.message}`, {}, { cause: e }));
  }
}

function onLimit(e: unknown, shop: Shop): never {
  if (e instanceof AppError && e.code === "E_OTP_LIMIT") {
    const minutes = Number(e.context.retry_after_min ?? 60);
    log.event("enroll.otp.limited", {
      shop_name: shop.name,
      scope: String(e.context.scope ?? "numero"),
      retry_after_min: minutes,
    });
    const blocked = e.context.scope === "numero bloccato";
    throw logged(
      new AppError("E_OTP_LIMIT", e.message, e.context, {
        userMessage: blocked
          ? `Troppi codici sbagliati: riprova tra ${minutes} minuti.`
          : "Troppi codici richiesti per questo numero. Riprova più tardi.",
      }),
    );
  }
  throw e;
}

export async function startEnrollment(input: z.output<typeof EnrollStartBody>) {
  const shop = await shopForEnrollment(input.shopSlug);
  const phone = checkItalianMobile(input.phone, input.phonePrefix);
  if (!phone.ok) {
    throw new AppError(
      "E_PHONE_INVALID",
      `telefono non valido (${phone.reason})`,
      { fields: ["body.phone"] },
      { userMessage: phone.message },
    );
  }
  log.event("enroll.form.submitted", {
    shop_name: shop.name,
    phone: phone.e164,
    consent_marketing: input.consentMarketing,
    platform: getContext()?.platform ?? "public-web",
  });

  // tessera prepagata (Fase 9.5): deve esistere ed essere disponibile prima di mandare l'SMS
  const product = input.productCode ? await getProductByCode(shop.id, input.productCode) : null;
  if (input.productCode && (!product || !product.active)) {
    throw new AppError(
      "E_PREPAID_PRODUCT_NOT_FOUND",
      `tessera "${input.productCode}" inesistente o non disponibile nel negozio ${shop.slug}`,
    );
  }

  const captcha = await verifyCaptcha(input.captchaToken);
  if (!captcha.ok) {
    log.event("enroll.captcha.failed", { shop_name: shop.name, reason: captcha.reason });
    throw logged(new AppError("E_CAPTCHA_FAILED", `Turnstile ha rifiutato il token: ${captcha.reason}`));
  }

  const started = await rpc<{ enrollment_id: string }>("enrollment_start", {
    p_shop_id: shop.id,
    p_phone: phone.e164,
    p_phone_hash: phoneHash(phone.e164),
    p_name: input.name.trim(),
    p_consent_marketing: input.consentMarketing,
    p_ip_hash: getContext()?.ip_hash ?? null,
    p_limits: limits(),
  }).catch((e: unknown) => onLimit(e, shop));

  setContext({ enrollment_id: started.enrollment_id });
  if (product) {
    const { error } = await supabaseAdmin()
      .from("enrollment_sessions")
      .update({ prepaid_product_id: product.id })
      .eq("id", started.enrollment_id);
    if (error) throw error;
  }
  await sendOtp(started.enrollment_id, shop, phone.e164, 1);
  return { enrollmentId: started.enrollment_id, phoneDisplay: phone.display, resendInSeconds: RESEND_S };
}

interface SessionRow {
  id: string;
  shop_id: string;
  phone: string;
  name: string;
  consent_marketing: boolean;
  prepaid_product_id: string | null;
}

async function sessionShop(shopId: string): Promise<Shop> {
  const { data, error } = await supabaseAdmin().from("shops").select("slug").eq("id", shopId).single();
  if (error) throw error;
  return shopForEnrollment(data.slug as string);
}

export async function resendOtp(enrollmentId: string) {
  setContext({ enrollment_id: enrollmentId });
  const r = await rpc<{ send_number: number; phone: string; shop_id: string }>("enrollment_resend", {
    p_id: enrollmentId,
    p_ip_hash: getContext()?.ip_hash ?? null,
    p_limits: limits(),
  }).catch(async (e: unknown) => {
    if (e instanceof AppError && e.code === "E_OTP_LIMIT") {
      const { data } = await supabaseAdmin()
        .from("enrollment_sessions")
        .select("shop_id")
        .eq("id", enrollmentId)
        .single();
      onLimit(e, await sessionShop(data?.shop_id as string));
    }
    if (e instanceof AppError && e.code === "E_OTP_RESEND_TOO_SOON") {
      throw new AppError("E_OTP_RESEND_TOO_SOON", e.message, e.context, {
        userMessage: `Potrai chiedere un nuovo codice tra ${String(e.context.seconds_left)} secondi.`,
      });
    }
    throw e;
  });
  const shop = await sessionShop(r.shop_id);
  await sendOtp(enrollmentId, shop, r.phone, r.send_number);
  return { resendInSeconds: RESEND_S };
}

export async function verifyEnrollment(
  enrollmentId: string,
  code: string,
): Promise<z.input<typeof EnrollVerifyResponse>> {
  setContext({ enrollment_id: enrollmentId });
  const s = await rpc<SessionRow>("enrollment_get", { p_id: enrollmentId });
  const shop = await sessionShop(s.shop_id);
  const funnel = { enrollment_id: enrollmentId, shop_name: shop.name };

  const check = await otpProvider().check(s.phone, code);
  if (check === "expired") {
    throw new AppError("E_OTP_EXPIRED", "il fornitore SMS non ha più una verifica in corso per questo numero");
  }
  const r = await rpc<{ ok: boolean; attempts?: number; attempts_left?: number; blocked_min?: number }>(
    "enrollment_record_check",
    { p_id: enrollmentId, p_ok: check === "approved" },
  );
  if (!r.ok || check === "too_many") {
    if (check === "too_many" || r.attempts_left === 0) {
      log.event("enroll.otp.too_many_attempts", { ...funnel, blocked_min: r.blocked_min ?? 15 });
      throw logged(new AppError("E_OTP_TOO_MANY_ATTEMPTS", "5 codici sbagliati: numero bloccato per 15 minuti"));
    }
    const left = r.attempts_left ?? 0;
    log.event("enroll.otp.wrong_code", { ...funnel, attempts_left: left });
    throw logged(
      new AppError(
        "E_OTP_WRONG_CODE",
        `codice sbagliato, restano ${left} tentativi`,
        { attempts_left: left },
        {
          userMessage: `Codice non corretto. ${left === 1 ? "Ti resta 1 tentativo." : `Ti restano ${left} tentativi.`}`,
        },
      ),
    );
  }
  log.event("enroll.otp.verified", { ...funnel, attempts: r.attempts ?? 1 });

  if (s.prepaid_product_id) return verifyPrepaid(enrollmentId, s, shop);

  const result = await enroll({
    shop,
    shopSlug: shop.slug,
    name: s.name,
    phone: s.phone,
    consentPrivacy: true,
    consentMarketing: s.consent_marketing,
  });
  await rpc("enrollment_complete", { p_id: enrollmentId, p_customer_id: result.customer.id });

  return {
    status: result.returning ? "returning" : "created",
    firstName: (result.returning ? result.customer.name : s.name).split(/\s+/)[0] ?? "",
    card: {
      shortCode: result.customer.short_code,
      qrToken: result.customer.qr_token,
      stamps: result.customer.stamps,
      stampsRequired: shop.stamps_required,
      rewardsAvailable: result.customer.rewards_available,
      rewardLabel: shop.reward_label,
    },
    googleSaveUrl: result.googleSaveUrl,
    phoneLink: phoneLink(shop.slug, result.customer.id),
    prepaid: null,
  };
}

/** Telefono verificato per una tessera prepagata: la crea (o la ritrova) da attivare in negozio. */
async function verifyPrepaid(
  enrollmentId: string,
  s: SessionRow,
  shop: Shop,
): Promise<z.input<typeof EnrollVerifyResponse>> {
  const r = await rpc<{
    card_id: string;
    customer_id: string;
    returning: boolean;
    product_name: string;
  }>("prepaid_enroll", {
    p_product_id: s.prepaid_product_id,
    p_name: s.name,
    p_phone: s.phone,
    p_consent_privacy: true,
    p_consent_marketing: s.consent_marketing,
    p_meta: domainMeta({ type: "customer", customerId: "web" }),
  });
  await rpc("enrollment_complete", { p_id: enrollmentId, p_customer_id: r.customer_id });
  const [{ data: card, error }, { data: product, error: e2 }, { data: person, error: e3 }] = await Promise.all([
    supabaseAdmin().from("prepaid_cards").select(PREPAID_CARD_COLS).eq("id", r.card_id).single<PrepaidCard>(),
    supabaseAdmin()
      .from("prepaid_products")
      .select(PREPAID_PRODUCT_COLS)
      .eq("id", s.prepaid_product_id!)
      .single<PrepaidProduct>(),
    supabaseAdmin().from("customers").select("name").eq("id", r.customer_id).single(),
  ]);
  if (error) throw error;
  if (e2) throw e2;
  if (e3) throw e3;
  setContext({ customer_ref: card.short_code });
  log.event("prepaid.enroll.created", {
    enrollment_id: enrollmentId,
    customer_ref: card.short_code,
    shop_name: shop.name,
    product_name: product.name,
    unit_singular: product.unit_singular,
    unit_plural: product.unit_plural,
    returning: r.returning,
  });
  // la tessera nasce su Google subito (da attivare): il link "Salva" la porta comunque completa
  if (!r.returning) await notifyPrepaidChanged(card.id);
  const state = prepaidState(card);
  const input = {
    state,
    balance: card.balance,
    chargedUnits: card.charged_units,
    units: product.units,
    unitSingular: product.unit_singular,
    unitPlural: product.unit_plural,
    expiresAt: card.expires_at ? new Date(card.expires_at).toISOString() : null,
  };
  const name = person.name as string;
  return {
    status: r.returning ? "returning" : "created",
    firstName: (r.returning ? name : s.name).split(/\s+/)[0] ?? "",
    card: {
      shortCode: card.short_code,
      qrToken: card.qr_token,
      stamps: 0,
      stampsRequired: shop.stamps_required,
      rewardsAvailable: 0,
      rewardLabel: shop.reward_label,
    },
    googleSaveUrl: googleEnabled() ? prepaidSaveUrl(shop, product, card, name) : null,
    phoneLink: prepaidPhoneLink(shop.slug, card.id),
    prepaid: {
      productName: product.name,
      state,
      balance: card.balance,
      units: input.units,
      unitSingular: input.unitSingular,
      unitPlural: input.unitPlural,
      expiresAt: input.expiresAt,
      module: prepaidModule(input),
    },
  };
}

/** Passi del funnel che avvengono nel browser (link mostrato, link aperto). */
export async function recordFunnelStep(enrollmentId: string, step: "link.shown" | "link.clicked", wallet: string) {
  setContext({ enrollment_id: enrollmentId });
  const { data } = await supabaseAdmin()
    .from("enrollment_sessions")
    .select("shop_id, customer_id, status, prepaid_product_id")
    .eq("id", enrollmentId)
    .maybeSingle();
  if (!data || data.status !== "verified" || !data.customer_id) {
    throw new AppError("E_OTP_EXPIRED", "passo del funnel per un'iscrizione inesistente o non completata");
  }
  const [{ data: shop }, { data: customer }] = await Promise.all([
    supabaseAdmin().from("shops").select("name").eq("id", data.shop_id).single(),
    // per una tessera prepagata il codice nei log è quello della tessera
    data.prepaid_product_id
      ? supabaseAdmin()
          .from("prepaid_cards")
          .select("short_code")
          .eq("customer_id", data.customer_id)
          .eq("product_id", data.prepaid_product_id)
          .is("deleted_at", null)
          .single()
      : supabaseAdmin().from("customers").select("short_code").eq("id", data.customer_id).single(),
  ]);
  setContext({ shop_id: data.shop_id as string, customer_ref: customer?.short_code as string });
  log.event(step === "link.shown" ? "enroll.wallet.link.shown" : "enroll.wallet.link.clicked", {
    enrollment_id: enrollmentId,
    shop_name: (shop?.name as string) ?? "",
    customer_ref: (customer?.short_code as string) ?? "",
    wallet,
  });
}
