import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { cardColors, contrast, gridLayout, monogram, strip, theme } from "./theme";

// esegue l'originale del design (docs/design/lw-core.js) con un window finto
const source = readFileSync(fileURLToPath(new URL("../../docs/design/lw-core.js", import.meta.url)), "utf8");
const sandbox: { window: Record<string, unknown> } = { window: {} };
runInNewContext(source, sandbox);
const LW = sandbox.window.LW as {
  theme: (b: string, m: string) => Record<string, unknown>;
  cardColors: (b: string) => Record<string, unknown>;
  strip: (o: object) => string;
  monogram: (n: string, bg: string, fg: string, s: number) => string;
  presets: Record<string, { brand: string; shop: string; icon: string; n: number }>;
};

const brands = [
  ...Object.values(LW.presets).map((p) => p.brand),
  "#7c3aed",
  "#0f766e",
  "#FFFFFF",
  "#000000",
  "#F7C843",
];

describe("tema per negozio = lw-core.js del design", () => {
  it.each(
    brands.flatMap((b) => [
      [b, "light"],
      [b, "dark"],
    ]),
  )("%s in modalità %s", (brand, mode) => {
    const ours = theme(brand, mode) as unknown as Record<string, unknown>;
    const ref = LW.theme(brand, mode);
    for (const key of Object.keys(ours)) expect(ours[key], key).toEqual(ref[key]);
  });

  it.each(brands)("colori della carta per %s", (brand) => {
    const ref = LW.cardColors(brand);
    expect(cardColors(brand)).toEqual(ref);
  });

  it("griglia dei timbri identica (SVG) per i negozi d'esempio", () => {
    for (const p of Object.values(LW.presets)) {
      const c = cardColors(p.brand);
      const o = {
        n: p.n,
        filled: 3,
        w: 1032,
        h: 336,
        bg: c.bg,
        fg: c.fg,
        ring: c.ring,
        icon: p.icon as "scissors",
        numbers: true,
        rewards: 1,
      };
      expect(strip(o)).toBe(LW.strip(o));
    }
    expect(monogram("Salone Nora", "#5B1F2E", "#FFFFFF", 120)).toBe(
      decodeURIComponent(LW.monogram("Salone Nora", "#5B1F2E", "#FFFFFF", 120).split(",")[1] ?? ""),
    );
  });

  it("garanzie di contrasto: testo sulla carta ≥ 4.5, accento con testo ≥ 4.5", () => {
    for (const b of brands) {
      const t = theme(b);
      expect(contrast(t.cardFg, t.cardBg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t.accent, t.onAccent)).toBeGreaterThanOrEqual(4.5);
    }
    expect(gridLayout(10)).toEqual({ rows: 2, cols: 5, perRow: [5, 5] });
  });
});
