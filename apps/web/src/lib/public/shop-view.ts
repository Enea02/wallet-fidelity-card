import { pointsTagline, taglineFor as sharedTagline } from "@loyalty/shared/copy";
import { cardColors, monogram, strip, svgDataUrl, type StampIcon } from "@loyalty/shared/theme";
import type { PrepaidProduct, Shop } from "../types";

/** Dati del negozio che arrivano al browser (niente id interni né dati del titolare). */
export interface PublicShop {
  slug: string;
  name: string;
  programName: string;
  /** Fase 9.6: carta a timbri oppure a punti (niente griglia dei timbri). */
  mode: Shop["loyalty_mode"];
  tagline: string;
  stampsRequired: number;
  rewardLabel: string;
  stampUnit: string;
  stampUnitPlural: string;
  icon: StampIcon;
  /** Logo del negozio, oppure monogramma generato (data URL SVG). */
  logo: string;
  card: { bg: string; fg: string; label: string; ring: string };
}

/**
 * Frase d'apertura: quella del negozio o, se manca, "Ogni 10 tagli, taglio gratis."
 * (a punti: "1 punto per ogni euro: da 500 punti sei Gold.").
 */
export const taglineFor = (
  s: Pick<
    Shop,
    | "tagline"
    | "stamps_required"
    | "stamp_unit_plural"
    | "reward_label"
    | "loyalty_mode"
    | "points_per_euro"
    | "points_levels"
  >,
) =>
  s.loyalty_mode === "punti"
    ? s.tagline?.trim() || pointsTagline({ pointsPerEuro: s.points_per_euro, levels: s.points_levels })
    : sharedTagline({
        tagline: s.tagline,
        stampsRequired: s.stamps_required,
        stampUnitPlural: s.stamp_unit_plural,
        rewardLabel: s.reward_label,
      });

export function publicShop(shop: Shop): PublicShop {
  const c = cardColors(shop.hex_color.toUpperCase());
  return {
    slug: shop.slug,
    name: shop.name,
    programName: shop.program_name,
    mode: shop.loyalty_mode,
    tagline: taglineFor(shop),
    stampsRequired: shop.stamps_required,
    rewardLabel: shop.reward_label,
    stampUnit: shop.stamp_unit,
    stampUnitPlural: shop.stamp_unit_plural,
    icon: shop.stamp_icon as StampIcon,
    logo: shop.logo_url ?? svgDataUrl(monogram(shop.name, c.fg, c.bg, 120)),
    card: { bg: c.bg, fg: c.fg, label: c.label, ring: c.ring },
  };
}

/** Griglia dei timbri della carta (SVG come data URL), come nel design. */
export function stripUrl(s: PublicShop, filled: number, rewards = 0): string {
  return svgDataUrl(
    strip({
      n: s.stampsRequired,
      filled,
      rewards,
      w: 1032,
      h: 336,
      bg: s.card.bg,
      fg: s.card.fg,
      ring: s.card.ring,
      icon: s.icon,
      numbers: true,
      transparent: true,
    }),
  );
}

/** Tessera prepagata (Fase 9.5) o abbonamento (Fase 9.6) offerto dal negozio: pagina /<negozio>/t/<code>. */
export interface PublicProduct {
  code: string;
  name: string;
  kind: PrepaidProduct["kind"];
  benefit: string | null;
  units: number;
  unitSingular: string;
  unitPlural: string;
  validityMonths: number | null;
}

type ProductRow = Pick<
  PrepaidProduct,
  "code" | "name" | "kind" | "benefit" | "units" | "unit_singular" | "unit_plural" | "validity_months"
>;

export const publicProduct = (p: ProductRow): PublicProduct => ({
  code: p.code,
  name: p.name,
  kind: p.kind,
  benefit: p.benefit,
  units: p.units ?? 0,
  unitSingular: p.unit_singular ?? "",
  unitPlural: p.unit_plural ?? "",
  validityMonths: p.validity_months,
});

/** Titolo della pagina e del cartello della tessera: "150 pagine sul telefono…" o il vantaggio dell'abbonamento. */
export function productHeadline(p: ProductRow): string {
  if (p.kind === "abbonamento") {
    const benefit = (p.benefit ?? "").trim();
    return `${benefit.charAt(0).toUpperCase()}${benefit.slice(1)}, con la tessera sul telefono.`;
  }
  const units = p.units ?? 0;
  return `${units} ${units === 1 ? p.unit_singular : p.unit_plural} sul telefono, senza tessera di carta.`;
}
