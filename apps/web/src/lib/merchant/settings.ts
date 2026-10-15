import "server-only";
import { randomUUID } from "node:crypto";
import { LOGO_MAX_BYTES, LOGO_TYPES, type SettingsUpdateBody, type ShopSettings } from "@loyalty/shared/api";
import type { StampIcon } from "@loyalty/shared/theme";
import { AppError } from "@loyalty/shared/errors";
import type { ActorFields } from "@loyalty/shared/logging/events";
import type { z } from "zod";
import { log } from "../observability/logger";
import { supabaseAdmin } from "../supabase";
import type { Shop } from "../types";
import { notifyShopChanged } from "../wallet/notifier";
import { callDomain, staffMeta } from "./domain-call";

const BUCKET = "logos";
const COLS =
  "name, slug, hex_color, stamps_required, reward_label, stamp_cooldown_minutes, logo_url, legal_name, vat_number, privacy_email, status, program_name, stamp_unit, stamp_unit_plural, stamp_icon, tagline";

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
  program_name: string;
  stamp_unit: string;
  stamp_unit_plural: string;
  stamp_icon: StampIcon;
  tagline: string | null;
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
  programName: r.program_name,
  stampUnit: r.stamp_unit,
  stampUnitPlural: r.stamp_unit_plural,
  stampIcon: r.stamp_icon,
  tagline: r.tagline,
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
  program_name: "nome del programma",
  stamp_unit: "unità (singolare)",
  stamp_unit_plural: "unità (plurale)",
  stamp_icon: "icona del timbro",
  tagline: "frase d'apertura",
};

const show = (v: unknown) => (v === null || v === undefined || v === "" ? "vuoto" : String(v));

/** Verifica che il logo caricato esista, sia del negozio e nei limiti; restituisce l'URL pubblico. */
/**
 * Verifica il logo appena caricato (esiste, è del negozio, tipo e peso ammessi) e ne restituisce
 * l'URL pubblico. Scrive logo.upload.ok o logo.upload.failed: il logo precedente resta finché non passa.
 */
async function publicLogoUrl(shop: Shop, path: string, actor: ActorFields): Promise<string> {
  const fail = (reason: string, status: number | null, message: string): never => {
    log.event("logo.upload.failed", { shop_name: shop.name, stage: "verifica", reason, http_status: status });
    const err = new AppError("E_LOGO_INVALID", message);
    err.logged = true;
    throw err;
  };
  if (!path.startsWith(`${shop.id}/`)) {
    fail("file di un altro negozio", 403, `il logo ${path} non appartiene al negozio ${shop.id}`);
  }
  const storage = supabaseAdmin().storage.from(BUCKET);
  const { data, error } = await storage.info(path);
  if (error || !data) {
    fail("file non trovato, caricamento non completato", 404, `logo ${path} non trovato nello Storage`);
  }
  const info = data as { contentType?: string | null; size?: number | null; metadata?: Record<string, unknown> };
  const contentType = String(info.contentType ?? info.metadata?.mimetype ?? "");
  const size = Number(info.size ?? info.metadata?.size ?? 0);
  if (contentType && !(LOGO_TYPES as readonly string[]).includes(contentType)) {
    fail(`formato ${contentType} non ammesso`, 415, `logo ${path} di tipo ${contentType}`);
  }
  if (size > LOGO_MAX_BYTES) {
    fail(
      `immagine di ${(size / 1024 / 1024).toFixed(1).replace(".", ",")} MB, massimo 2 MB`,
      413,
      `logo ${path} di ${size} byte`,
    );
  }
  log.event("logo.upload.ok", {
    ...actor,
    shop_name: shop.name,
    content_type: contentType || "sconosciuto",
    size_bytes: size,
  });
  return publicUrl(storage.getPublicUrl(path).data.publicUrl);
}

/**
 * In sviluppo Supabase è su 127.0.0.1, che Google non raggiunge: con SUPABASE_PUBLIC_URL (un tunnel)
 * l'URL salvato del logo usa l'indirizzo pubblico. In produzione la variabile non c'è.
 */
function publicUrl(url: string): string {
  const pub = process.env.SUPABASE_PUBLIC_URL?.replace(/\/$/, "");
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  return pub && base && url.startsWith(base) ? `${pub}${url.slice(base.length)}` : url;
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
  if (input.programName !== undefined) changes.program_name = input.programName;
  if (input.stampUnit !== undefined) changes.stamp_unit = input.stampUnit;
  if (input.stampUnitPlural !== undefined) changes.stamp_unit_plural = input.stampUnitPlural;
  if (input.stampIcon !== undefined) changes.stamp_icon = input.stampIcon;
  if (input.tagline !== undefined) changes.tagline = input.tagline;
  if (input.logoPath !== undefined) {
    changes.logo_path = input.logoPath;
    changes.logo_url = await publicLogoUrl(shop, input.logoPath, actor);
  }

  const r = await callDomain<{
    before: Record<string, unknown>;
    after: Record<string, unknown>;
    shop_name: string;
    card_changed: boolean;
  }>("update_shop_settings", { p_shop_id: shop.id, p_changes: changes, p_meta: staffMeta(userId) });
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
  // template Google subito; le carte con la versione vecchia le riallinea la riconciliazione del cron
  if (r.card_changed) await notifyShopChanged(shop);
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
