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
  "name, slug, hex_color, stamps_required, reward_label, stamp_cooldown_minutes, logo_url, legal_name, vat_number, privacy_email, status, program_name, stamp_unit, stamp_unit_plural, stamp_icon, tagline, loyalty_enabled, loyalty_mode, points_per_euro, points_min_cents, points_levels";

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
  loyalty_enabled: boolean;
  loyalty_mode: Shop["loyalty_mode"];
  points_per_euro: number;
  points_min_cents: number;
  points_levels: Shop["points_levels"];
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
  loyaltyEnabled: r.loyalty_enabled,
  loyaltyMode: r.loyalty_mode,
  pointsPerEuro: r.points_per_euro,
  pointsMinCents: r.points_min_cents,
  pointsLevels: r.points_levels,
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

interface PointsSettings {
  mode: Shop["loyalty_mode"];
  points_per_euro: number;
  min_cents: number;
  levels: Shop["points_levels"];
}

const euro = (cents: number) => `${(cents / 100).toFixed(2).replace(".", ",")} €`;
const levelsText = (l: Shop["points_levels"]) => l.map((x) => `${x.name} ${x.min}`).join(" · ");

/** "modalità timbri → punti, punti per euro 1 → 2, livelli Silver 0 · Gold 500 → …" */
function pointsChanges(b: PointsSettings, a: PointsSettings): string {
  const parts: string[] = [];
  if (b.mode !== a.mode) parts.push(`modalità ${b.mode} → ${a.mode}`);
  if (b.points_per_euro !== a.points_per_euro) parts.push(`punti per euro ${b.points_per_euro} → ${a.points_per_euro}`);
  if (b.min_cents !== a.min_cents) parts.push(`spesa minima ${euro(b.min_cents)} → ${euro(a.min_cents)}`);
  if (JSON.stringify(b.levels) !== JSON.stringify(a.levels)) {
    const perks = (l: Shop["points_levels"]) => l.map((x) => x.perk).join("|");
    parts.push(
      levelsText(b.levels) === levelsText(a.levels) && perks(b.levels) !== perks(a.levels)
        ? "vantaggi dei livelli modificati"
        : `livelli ${levelsText(b.levels)} → ${levelsText(a.levels)}`,
    );
  }
  return parts.join(", ");
}

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

  // carta fedeltà attiva o no (Fase 9.5): funzione a parte, con il suo audit
  let loyalty: string | null = null;
  if (input.loyaltyEnabled !== undefined) {
    const l = await callDomain<{ changed: boolean }>("set_loyalty_enabled", {
      p_shop_id: shop.id,
      p_enabled: input.loyaltyEnabled,
      p_meta: staffMeta(userId),
    });
    if (l.changed) loyalty = `carta fedeltà ${input.loyaltyEnabled ? "spenta → attiva" : "attiva → spenta"}`;
  }

  // carta a timbri o a punti, regola e livelli (Fase 9.6): funzione a parte, con il suo audit
  const pointsFields: Record<string, unknown> = {};
  if (input.loyaltyMode !== undefined) pointsFields.mode = input.loyaltyMode;
  if (input.pointsPerEuro !== undefined) pointsFields.points_per_euro = input.pointsPerEuro;
  if (input.pointsMinCents !== undefined) pointsFields.min_cents = input.pointsMinCents;
  if (input.pointsLevels !== undefined) pointsFields.levels = input.pointsLevels;
  let pointsCardChanged = false;
  if (Object.keys(pointsFields).length > 0) {
    const p = await callDomain<{ changed: false } | { changed: true; before: PointsSettings; after: PointsSettings }>(
      "update_points_settings",
      { p_shop_id: shop.id, p_fields: pointsFields, p_meta: staffMeta(userId) },
    );
    if (p.changed) {
      log.event("points.settings.updated", {
        ...actor,
        shop_name: shop.name,
        changes: pointsChanges(p.before, p.after),
      });
      pointsCardChanged =
        p.before.mode !== p.after.mode || JSON.stringify(p.before.levels) !== JSON.stringify(p.after.levels);
    }
  }

  const r =
    Object.keys(changes).length > 0
      ? await callDomain<{
          before: Record<string, unknown>;
          after: Record<string, unknown>;
          shop_name: string;
          card_changed: boolean;
        }>("update_shop_settings", { p_shop_id: shop.id, p_changes: changes, p_meta: staffMeta(userId) })
      : { before: {}, after: {}, shop_name: shop.name, card_changed: false };
  const changed = Object.keys(r.after).filter((k) => k !== "logo_path");
  const parts = changed.map((k) =>
    k === "logo_url" ? "logo sostituito" : `${LABELS[k] ?? k} ${show(r.before[k])} → ${show(r.after[k])}`,
  );
  if (loyalty) parts.push(loyalty);
  log.event("settings.update.ok", {
    ...actor,
    shop_name: r.shop_name,
    changed_fields: loyalty ? [...changed, "loyalty_enabled"] : changed,
    changes: parts.length === 0 ? "nessuna modifica (valori uguali a quelli già salvati)" : parts.join(", "),
  });
  // template Google subito; le carte con la versione vecchia le riallinea la riconciliazione del cron
  if (r.card_changed || loyalty || pointsCardChanged) {
    await notifyShopChanged(loyalty ? { ...shop, loyalty_enabled: input.loyaltyEnabled === true } : shop);
  }
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
