import "server-only";
import { AppError } from "@loyalty/shared/errors";
import { maskEmail } from "@loyalty/shared/logger";
import { z } from "zod";
import { getShopById } from "../loyalty";
import { callDomain, domainMeta } from "../merchant/domain-call";
import { setContext } from "../observability/context";
import { log } from "../observability/logger";
import { supabaseAdmin } from "../supabase";
import type { Shop } from "../types";
import type { SupportUser } from "./session";

/*
 * Negozi dal pannello interno: elenco, creazione con invito del titolare, sospensione e
 * riattivazione, dati per l'informativa. Le modifiche passano dalle funzioni Postgres
 * (create_shop, set_shop_status, update_shop_legal), che scrivono audit_log come support.
 */

export const supportMeta = (user: SupportUser) => domainMeta({ type: "support", name: user.name });

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null);

export const NewShopInput = z.object({
  name: z
    .string()
    .trim()
    .min(2, "nome del negozio da 2 a 60 caratteri")
    .max(60, "nome del negozio da 2 a 60 caratteri"),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "indirizzo: solo lettere minuscole, numeri e trattini (es. barberia-rossi)")
    .min(3, "indirizzo da 3 a 40 caratteri")
    .max(40, "indirizzo da 3 a 40 caratteri"),
  ownerName: z
    .string()
    .trim()
    .min(2, "nome del titolare da 2 a 40 caratteri")
    .max(40, "nome del titolare da 2 a 40 caratteri"),
  ownerEmail: z.email("email del titolare non valida").trim().toLowerCase(),
  legalName: optionalText(120),
  vatNumber: optionalText(20),
  privacyEmail: z.union([z.literal(""), z.email("email privacy non valida")]).transform((v) => v || null),
});

export const LegalInput = z.object({
  legalName: optionalText(120),
  vatNumber: optionalText(20),
  privacyEmail: z.union([z.literal(""), z.email("email privacy non valida")]).transform((v) => v || null),
});

/** Errore di validazione dei moduli del pannello, con il primo problema come messaggio. */
export function parseForm<S extends z.ZodType>(schema: S, value: unknown): z.output<S> {
  const r = schema.safeParse(value);
  if (r.success) return r.data;
  const first = r.error.issues[0];
  throw new AppError(
    "E_VALIDATION",
    `modulo del pannello non valido: ${r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
    { fields: r.error.issues.map((i) => i.path.join(".")) },
    { userMessage: first ? `Dati non validi: ${first.message}.` : "Dati non validi." },
  );
}

export interface ShopRow {
  id: string;
  slug: string;
  name: string;
  status: "active" | "suspended";
  created_at: string;
  customers: number;
  staff: number;
}

export async function listShops(query?: string): Promise<ShopRow[]> {
  const db = supabaseAdmin();
  let q = db.from("shops").select("id, slug, name, status, created_at").order("name");
  if (query) q = q.or(`slug.ilike.%${query.replace(/[%,()]/g, "")}%,name.ilike.%${query.replace(/[%,()]/g, "")}%`);
  const { data, error } = await q.limit(200);
  if (error) throw error;
  const shops = (data ?? []) as Array<Omit<ShopRow, "customers" | "staff">>;
  const counts = await Promise.all(
    shops.map(async (s) => {
      const [c, st] = await Promise.all([
        db.from("customers").select("id", { count: "exact", head: true }).eq("shop_id", s.id).is("deleted_at", null),
        db.from("staff").select("user_id", { count: "exact", head: true }).eq("shop_id", s.id),
      ]);
      return { customers: c.count ?? 0, staff: st.count ?? 0 };
    }),
  );
  return shops.map((s, i) => ({ ...s, ...counts[i]! }));
}

export interface StaffRow {
  user_id: string;
  display_name: string;
  role: "owner" | "operator";
  email: string;
  stamps_given: number;
  invite_pending: boolean;
}

export async function shopDetail(shopId: string) {
  const shop = await getShopById(shopId);
  setContext({ shop_id: shop.id });
  const db = supabaseAdmin();
  const [{ data: staff, error }, customers] = await Promise.all([
    db.rpc("staff_overview", { p_shop_id: shop.id }),
    db.from("customers").select("id", { count: "exact", head: true }).eq("shop_id", shop.id).is("deleted_at", null),
  ]);
  if (error) throw error;
  return { shop, staff: (staff ?? []) as StaffRow[], customers: customers.count ?? 0 };
}

/** Nuovo negozio: invito del titolare (se non ha già un account), poi negozio e titolare in una transazione. */
export async function createShop(input: z.output<typeof NewShopInput>, user: SupportUser) {
  const db = supabaseAdmin();
  const { data: taken } = await db.from("shops").select("id").eq("slug", input.slug).maybeSingle();
  if (taken) throw new AppError("E_SHOP_SLUG_TAKEN", `lo slug ${input.slug} è già usato`, { slug: input.slug });

  const { data: existingId, error } = await db.rpc("find_user_id_by_email", { p_email: input.ownerEmail });
  if (error) throw error;
  let ownerId = existingId as string | null;
  if (!ownerId) {
    const base = process.env.MERCHANT_APP_URL ?? process.env.APP_BASE_URL ?? "";
    const { data, error: inviteError } = await db.auth.admin.inviteUserByEmail(input.ownerEmail, {
      redirectTo: `${base.replace(/\/$/, "")}/invito`,
      data: { name: input.ownerName, shop_name: input.name },
    });
    if (inviteError || !data.user) {
      throw new AppError(
        "E_INVITE_FAILED",
        `invito del titolare ${maskEmail(input.ownerEmail)} non riuscito: ${inviteError?.message ?? "utente non creato"}`,
      );
    }
    ownerId = data.user.id;
  }

  let created: { id: string; slug: string; name: string };
  try {
    created = await callDomain("create_shop", {
      p_slug: input.slug,
      p_name: input.name,
      p_owner_user_id: ownerId,
      p_owner_name: input.ownerName,
      p_legal_name: input.legalName,
      p_vat_number: input.vatNumber,
      p_privacy_email: input.privacyEmail,
      p_meta: supportMeta(user),
    });
  } catch (e) {
    // account appena creato per un negozio che non esiste: si toglie, così si può riprovare pulito
    if (!existingId) await db.auth.admin.deleteUser(ownerId).catch(() => undefined);
    throw e;
  }
  setContext({ shop_id: created.id });
  log.event("shop.created", {
    support_name: user.name,
    shop_name: created.name,
    slug: created.slug,
    owner_name: input.ownerName,
    owner_email: maskEmail(input.ownerEmail),
    existing_account: existingId !== null,
  });
  return created;
}

export async function setShopStatus(shopId: string, status: Shop["status"], reason: string, user: SupportUser) {
  const shop = await getShopById(shopId);
  setContext({ shop_id: shop.id });
  const r = await callDomain<{ changed: boolean }>("set_shop_status", {
    p_shop_id: shop.id,
    p_status: status,
    p_reason: reason,
    p_meta: supportMeta(user),
  });
  if (r.changed) {
    const { count } = await supabaseAdmin()
      .from("customers")
      .select("id", { count: "exact", head: true })
      .eq("shop_id", shop.id)
      .is("deleted_at", null);
    log.event(status === "suspended" ? "shop.suspended" : "shop.reactivated", {
      support_name: user.name,
      shop_name: shop.name,
      slug: shop.slug,
      reason: reason.trim(),
      cards: count ?? 0,
    });
  }
  return r;
}

const LEGAL_LABEL = {
  legal_name: "ragione sociale",
  vat_number: "partita IVA",
  privacy_email: "email privacy",
} as const;

export async function updateLegal(shopId: string, input: z.output<typeof LegalInput>, user: SupportUser) {
  const shop = await getShopById(shopId);
  setContext({ shop_id: shop.id });
  await callDomain("update_shop_legal", {
    p_shop_id: shop.id,
    p_legal_name: input.legalName,
    p_vat_number: input.vatNumber,
    p_privacy_email: input.privacyEmail,
    p_meta: supportMeta(user),
  });
  const next = { legal_name: input.legalName, vat_number: input.vatNumber, privacy_email: input.privacyEmail };
  const changed = (Object.keys(next) as Array<keyof typeof next>).filter((k) => (shop[k] ?? null) !== next[k]);
  if (changed.length > 0) {
    log.event("shop.legal.updated", {
      support_name: user.name,
      shop_name: shop.name,
      changes: changed.map((k) => LEGAL_LABEL[k]).join(", "),
    });
  }
  return { changed: changed.length };
}
