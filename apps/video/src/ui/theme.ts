import { loadFont } from "@remotion/google-fonts/BricolageGrotesque";

/** Palette di Loyalty Wallet (carta, inchiostro, vino), la stessa del web pubblico e dell'app. */
export const C = {
  bg: "#F6F2EC",
  surface: "#FFFDFA",
  ink: "#2A211C",
  ink2: "#6B5E55",
  line: "#DDD4CB",
  wine: "#5B1F2E",
  wineSoft: "#F1E3E5",
  /** colore del negozio demo che compare nelle schermate */
  shop: "#7C3AED",
  ok: "#1F7A4D",
} as const;

const { fontFamily } = loadFont("normal", {
  weights: ["400", "500", "600", "700", "800"],
  subsets: ["latin", "latin-ext"],
});
export const FONT = fontFamily;

export const FPS = 30;
export const s = (seconds: number) => Math.round(seconds * FPS);
