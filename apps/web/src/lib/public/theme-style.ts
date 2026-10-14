import { theme, themeVars } from "@loyalty/shared/theme";

/** Inchiostro del design: tema "neutro" delle pagine senza negozio (accento = inchiostro). */
export const NEUTRAL_BRAND = "#2A211C";

const block = (vars: Record<string, string>) =>
  Object.entries(vars)
    .map(([k, v]) => `${k}:${v}`)
    .join(";");

/**
 * CSS con le variabili --lw-* del tema del negozio, in chiaro e in scuro (segue il sistema).
 * Il colore del negozio viene corretto per il contrasto (packages/shared/theme.ts = lw-core.js).
 */
export function themeCss(brand: string | null | undefined): string {
  const light = theme(brand ?? NEUTRAL_BRAND, "light");
  const dark = theme(brand ?? NEUTRAL_BRAND, "dark");
  return (
    `:root{color-scheme:light;${block(themeVars(light))}}` +
    `@media (prefers-color-scheme: dark){:root{color-scheme:dark;${block(themeVars(dark))}}}`
  );
}
