import "server-only";
import { randomUUID } from "node:crypto";
import { LOGO_MAX_BYTES, LOGO_TYPES, type SettingsUpdateBody, type ShopSettings } from "@loyalty/shared/api";
import { AppError } from "@loyalty/shared/errors";
import type { ActorFields } from "@loyalty/shared/logging/events";
import type { z } from "zod";
import { log } from "../observability/logger";
import { supabaseAdmin } from "../supabase";
import type { Shop } from "../types";
import { callDomain, staffMeta } from "./domain-call";

const BUCKET = "logos";
const COLS =
  "name, slug, hex_color, stamps_required, reward_label, stamp_cooldown_minutes, logo_url, legal_name, vat_number, privacy_email, status";

interface Row {
  name: string;
  slug: string;
  hex_color: string;
  stamps_required: number;
  reward_label: string;
  stamp_cooldown_minutes: number;
  logo_url: string | null;
  legal_name: string | null;
  vat_number: string | null;
  privacy_email: string | null;
  status: "active" | "suspended";
}

const toSettings = (r: Row): z.input<typeof ShopSettings> => ({
  name: r.name,
  slug: r.slug,
  hexColor: r.hex_color,
  stampsRequired: r.stamps_required,
  rewardLabel: r.reward_label,
  stampCooldownMinutes: r.stamp_cooldown_minutes,
  logoUrl: r.logo_url,
  legalName: r.legal_name,
  vatNumber: r.vat_number,
  privacyEmail: r.privacy_email,
  status: r.status,
});

export async function getSettings(shop: Shop) {
  const { data, error } = await supabaseAdmin().from("shops").select(COLS).eq("id", shop.id).single<Row>();
  if (error) throw error;
  return { settings: toSettings(data) };
}

/** Nomi in italiano dei campi, per il riepilogo nel log. */
const LABELS: Record<string, string> = {
  name: "nome",
  hex_color: "colore",
  stamps_required: "timbri richiesti",
  reward_label: "premio",
  stamp_cooldown_minutes: "minuti minimi tra due timbri",
  logo_url: "logo",
  legal_name: "ragione sociale",
  vat_number: "partita IVA",
  privacy_email: "email privacy",
};

const show = (v: unknown) => (v === null || v === undefined || v === "" ? "vuoto" : String(v));

/** Verifica che il logo caricato esista, sia del negozio e nei limiti; restituisce l'URL pubblico. */
async function publicLogoUrl(shop: Shop, path: string): Promise<string> {
  if (!path.startsWith(`${shop.id}/`)) {
    throw new AppError("E_LOGO_INVALID", `il logo ${path} non appartiene al negozio ${shop.id}`);
  }
  const storage = supabaseAdmin().storage.from(BUCKET);
  const { data, error } = await storage.info(path);
  if (error || !data)
    throw new AppError("E_LOGO_INVALID", `logo ${path} non trovato nello Storage: caricamento non completato`);
  return storage.getPublicUrl(path).data.publicUrl;
}

export async function updateSettings(
  shop: Shop,
  input: z.output<typeof SettingsUpdateBody>,
  userId: string,
  actor: ActorFields,
) {
  const changes: Record<string, unknown> = {};
  if (input.name !== undefined) changes.name = input.name;
  if (input.hexColor !== undefined) changes.hex_color = input.hexColor.toLowerCase();
  if (input.stampsRequired !== undefined) changes.stamps_required = input.stampsRequired;
  if (input.rewardLabel !== undefined) changes.reward_label = input.rewardLabel;
  if (input.stampCooldownMinutes !== undefined) changes.stamp_cooldown_minutes = input.stampCooldownMinutes;
  if (input.legalName !== undefined) changes.legal_name = input.legalName;
  if (input.vatNumber !== undefined) changes.vat_number = input.vatNumber;
  if (input.privacyEmail !== undefined) changes.privacy_email = input.privacyEmail;
  if (input.logoPath !== undefined) {
    changes.logo_path = input.logoPath;
    changes.logo_url = await publicLogoUrl(shop, input.logoPath);
  }

  const r = await callDomain<{ before: Record<string, unknown>; after: Record<string, unknown>; shop_name: string }>(
    "update_shop_settings",
    { p_shop_id: shop.id, p_changes: changes, p_meta: staffMeta(userId) },
  );
  const changed = Object.keys(r.after).filter((k) => k !== "logo_path");
  log.event("settings.update.ok", {
    ...actor,
    shop_name: r.shop_name,
    changed_fields: changed,
    changes:
      changed.length === 0
        ? "nessuna modifica (valori uguali a quelli già salvati)"
        : changed
            .map((k) =>
              k === "logo_url" ? "logo sostituito" : `${LABELS[k] ?? k} ${show(r.before[k])} → ${show(r.after[k])}`,
            )
            .join(", "),
  });
  return getSettings(shop);
}

/** URL firmato per caricare il logo direttamente su Supabase Storage (PNG, JPEG o WebP, max 2 MB). */
export async function logoUploadUrl(shop: Shop, contentType: string, sizeBytes: number, actor: ActorFields) {
  if (!(LOGO_TYPES as readonly string[]).includes(contentType) || sizeBytes > LOGO_MAX_BYTES) {
    throw new AppError("E_LOGO_INVALID", `logo di tipo ${contentType} e ${sizeBytes} byte non ammesso`, {
      content_type: contentType,
      size_bytes: sizeBytes,
    });
  }
  const ext = contentType.split("/")[1] === "jpeg" ? "jpg" : contentType.split("/")[1];
  const path = `${shop.id}/${randomUUID()}.${ext}`;
  const { data, error } = await supabaseAdmin().storage.from(BUCKET).createSignedUploadUrl(path);
  if (error) throw error;
  log.event("logo.upload_url.issued", {
    ...actor,
    shop_name: shop.name,
    content_type: contentType,
    size_bytes: sizeBytes,
  });
  return { uploadUrl: data.signedUrl, token: data.token, path: data.path };
}
