import { taglineFor as sharedTagline } from "@loyalty/shared/copy";
import { cardColors, monogram, strip, svgDataUrl, type StampIcon } from "@loyalty/shared/theme";
import type { Shop } from "../types";

/** Dati del negozio che arrivano al browser (niente id interni né dati del titolare). */
export interface PublicShop {
  slug: string;
  name: string;
  programName: string;
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

/** Frase d'apertura: quella del negozio o, se manca, "Ogni 10 tagli, taglio gratis." */
export const taglineFor = (s: Pick<Shop, "tagline" | "stamps_required" | "stamp_unit_plural" | "reward_label">) =>
  sharedTagline({
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
