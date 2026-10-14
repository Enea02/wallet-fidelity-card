import { theme as buildTheme, type Theme } from "@loyalty/shared/theme";
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useColorScheme, type TextStyle } from "react-native";

/*
 * Tema dell'app dal design system (docs/design/Design System.dc.html): neutri caldi fissi,
 * accento dal colore del negozio corretto per il contrasto (packages/shared/theme.ts = lw-core.js),
 * chiaro e scuro secondo il sistema. Senza negozio (login) l'accento è l'inchiostro.
 */

export const NEUTRAL_BRAND = "#2A211C";

/** Spaziatura su base 4 e raggi del design (04 · Componenti). */
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;
export const radius = { field: 10, button: 14, card: 20, pill: 999 } as const;

export const fonts = {
  regular: "BricolageGrotesque_400Regular",
  semibold: "BricolageGrotesque_600SemiBold",
  bold: "BricolageGrotesque_700Bold",
} as const;

/** Scala tipografica (02 · Tipografia): dimensione, interlinea, peso. */
export const typography = {
  display: { fontSize: 44, lineHeight: 46, fontFamily: fonts.bold, letterSpacing: -0.9 },
  title: { fontSize: 28, lineHeight: 32, fontFamily: fonts.bold, letterSpacing: -0.5 },
  subtitle: { fontSize: 20, lineHeight: 26, fontFamily: fonts.semibold },
  body: { fontSize: 16, lineHeight: 24, fontFamily: fonts.regular },
  bodyStrong: { fontSize: 16, lineHeight: 24, fontFamily: fonts.semibold },
  small: { fontSize: 14, lineHeight: 20, fontFamily: fonts.regular },
  label: { fontSize: 12, lineHeight: 16, fontFamily: fonts.semibold, letterSpacing: 0.4 },
  number: { fontSize: 56, lineHeight: 60, fontFamily: fonts.bold, fontVariant: ["tabular-nums"] },
} satisfies Record<string, TextStyle>;
export type TypeVariant = keyof typeof typography;

const ThemeContext = createContext<Theme>(buildTheme(NEUTRAL_BRAND, "light"));

export function ThemeProvider({ brand, children }: { brand: string | null | undefined; children: ReactNode }) {
  const scheme = useColorScheme();
  const t = useMemo(() => buildTheme(brand ?? NEUTRAL_BRAND, scheme === "dark" ? "dark" : "light"), [brand, scheme]);
  return <ThemeContext.Provider value={t}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
