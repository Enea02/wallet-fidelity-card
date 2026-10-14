/*
 * Tema per negozio, porting 1:1 di docs/design/lw-core.js (Claude Design):
 * - theme(brand, mode): tutti i token colore dal colore del negozio, con contrasto WCAG AA garantito;
 * - cardColors(brand): colori della carta nel Wallet (indipendenti dalla modalità del telefono);
 * - strip(...): griglia dei timbri in SVG (stesse regole per pagina, Google hero e Apple strip);
 * - monogram(...): logo di riserva quando il negozio non ne carica uno.
 * Unica fonte del tema per negozio: pagina di iscrizione, cartello, carta e app esercente.
 * test: theme.test.ts confronta i risultati con lw-core.js.
 */

type Rgb = [number, number, number];
type Oklch = [number, number, number];

const hexToRgb = (hex: string): Rgb => {
  let h = hex.replace("#", "");
  if (h.length === 3)
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255) as Rgb;
};
const toLin = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const fromLin = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(Math.max(c, 0), 1 / 2.4) - 0.055);
const rgbToHex = (rgb: number[]) =>
  "#" +
  rgb
    .map((v) =>
      Math.round(Math.min(1, Math.max(0, v)) * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")
    .toUpperCase();

export function rgbToOklch(rgb: Rgb): Oklch {
  const [r, g, b] = rgb.map(toLin) as Rgb;
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return [L, Math.hypot(A, B), ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360];
}

function oklchToRgb(L: number, C: number, H: number): Rgb {
  const a = C * Math.cos((H * Math.PI) / 180);
  const b = C * Math.sin((H * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map(fromLin) as Rgb;
}

const inGamut = (rgb: Rgb) => rgb.every((v) => v >= -0.001 && v <= 1.001);

export function oklch(L: number, C: number, H: number): string {
  let rgb = oklchToRgb(L, C, H);
  if (!inGamut(rgb)) {
    let lo = 0;
    let hi = C;
    for (let i = 0; i < 18; i++) {
      const mid = (lo + hi) / 2;
      if (inGamut(oklchToRgb(L, mid, H))) lo = mid;
      else hi = mid;
    }
    rgb = oklchToRgb(L, lo, H);
  }
  return rgbToHex(rgb);
}

const lum = (hex: string) => {
  const [r, g, b] = hexToRgb(hex).map(toLin) as Rgb;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const contrast = (a: string, b: string) => {
  const x = lum(a);
  const y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
export const mix = (a: string, b: string, t: number) => {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  return rgbToHex(A.map((v, i) => v * (1 - t) + (B[i] ?? 0) * t));
};
/** Colore valido in maiuscolo (#RRGGBB); se non valido, il bordeaux del design. */
export const norm = (input: string | null | undefined) => {
  let h = String(input ?? "").trim();
  if (!h.startsWith("#")) h = `#${h}`;
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(h) ? rgbToHex(hexToRgb(h)) : "#5B1F2E";
};

/** Sposta la luminosità (OKLCH L) finché il contrasto con `against` raggiunge `target`. */
function fit(hex: string, against: string, target: number, dir: number): string {
  let [L] = rgbToOklch(hexToRgb(hex));
  const [, C, H] = rgbToOklch(hexToRgb(hex));
  let out = hex;
  let i = 0;
  while (contrast(out, against) < target && i++ < 100) {
    L = Math.min(1, Math.max(0, L + dir * 0.01));
    out = oklch(L, C, H);
  }
  return out;
}

const WHITE = "#FFFFFF";
const INK = "#1E1915";
const onColor = (c: string) => (contrast(c, WHITE) >= contrast(c, INK) ? WHITE : INK);
const bestOn = (c: string) => Math.max(contrast(c, WHITE), contrast(c, INK));

type Mode = "light" | "dark";
const NEUTRAL: Record<Mode, Record<string, Oklch>> = {
  light: {
    bg: [0.968, 0.011, 78],
    surface: [0.995, 0.004, 85],
    surface2: [0.938, 0.013, 75],
    line: [0.874, 0.016, 70],
    ink: [0.235, 0.018, 55],
    ink2: [0.445, 0.02, 58],
    ink3: [0.62, 0.018, 62],
  },
  dark: {
    bg: [0.175, 0.009, 60],
    surface: [0.215, 0.011, 60],
    surface2: [0.258, 0.012, 60],
    line: [0.335, 0.013, 60],
    ink: [0.955, 0.009, 80],
    ink2: [0.775, 0.014, 72],
    ink3: [0.58, 0.014, 68],
  },
};
const SEM: Record<Mode, Record<string, Oklch>> = {
  light: {
    success: [0.48, 0.12, 150],
    danger: [0.5, 0.18, 28],
    warning: [0.5, 0.11, 70],
    successSoft: [0.95, 0.035, 150],
    dangerSoft: [0.95, 0.03, 28],
    warningSoft: [0.95, 0.045, 85],
  },
  dark: {
    success: [0.8, 0.13, 150],
    danger: [0.76, 0.14, 28],
    warning: [0.84, 0.12, 85],
    successSoft: [0.27, 0.04, 150],
    dangerSoft: [0.27, 0.045, 28],
    warningSoft: [0.28, 0.04, 80],
  },
};

export interface CardColors {
  bg: string;
  fg: string;
  label: string;
  ring: string;
  /** true se il colore del negozio è stato scurito per la leggibilità. */
  corrected: boolean;
}

/** Colori della carta nel Wallet: un solo colore, indipendente dalla modalità del telefono. */
export function cardColors(brand: string): CardColors {
  let bg = brand;
  if (bestOn(bg) < 4.5) bg = fit(bg, WHITE, 4.5, -1); // toni medi: scurisci il minimo indispensabile
  const fg = onColor(bg);
  let t = 0.4;
  while (t > 0 && contrast(mix(fg, bg, t), bg) < 4.5) t -= 0.02;
  let r = 0.62;
  while (r > 0 && contrast(mix(fg, bg, r), bg) < 3) r -= 0.02;
  return { bg, fg, label: mix(fg, bg, Math.max(t, 0)), ring: mix(fg, bg, Math.max(r, 0)), corrected: bg !== brand };
}

export interface Theme {
  brand: string;
  mode: Mode;
  bg: string;
  surface: string;
  surface2: string;
  line: string;
  ink: string;
  ink2: string;
  ink3: string;
  success: string;
  danger: string;
  warning: string;
  successSoft: string;
  dangerSoft: string;
  warningSoft: string;
  accent: string;
  onAccent: string;
  accentEdge: string;
  accentSoft: string;
  accentLine: string;
  accentText: string;
  cardBg: string;
  cardFg: string;
  cardLabel: string;
  cardRing: string;
  cardCorrected: boolean;
}

export function theme(brandIn: string | null | undefined, modeIn: string = "light"): Theme {
  const mode: Mode = modeIn === "dark" ? "dark" : "light";
  const brand = norm(brandIn);
  const [, C, H] = rgbToOklch(hexToRgb(brand));
  const t: Record<string, unknown> = { brand, mode };
  for (const [k, v] of Object.entries(NEUTRAL[mode])) t[k] = oklch(...v);
  for (const [k, v] of Object.entries(SEM[mode])) t[k] = oklch(...v);
  const bg = t.bg as string;
  const surface2 = t.surface2 as string;
  const dir = mode === "light" ? -1 : 1;

  // accent: riempimento pulsanti. Testo sopra ≥4.5, e in dark ≥3 contro lo sfondo
  let accent = brand;
  let [L] = rgbToOklch(hexToRgb(brand));
  let i = 0;
  const ok = (c: string) => bestOn(c) >= 4.5 && (mode === "light" || contrast(c, bg) >= 3);
  if (!ok(accent)) {
    const d = mode === "dark" && contrast(brand, bg) < 3 ? 1 : onColor(brand) === WHITE ? -1 : 1;
    while (!ok(accent) && i++ < 100) {
      L += d * 0.01;
      accent = oklch(L, C, H);
    }
  }
  t.accent = accent;
  t.onAccent = onColor(accent);
  t.accentEdge = contrast(accent, bg) >= 3 ? accent : fit(accent, bg, 3, dir);
  let at = fit(oklch(rgbToOklch(hexToRgb(brand))[0], Math.min(C, 0.17), H), bg, 4.6, dir);
  at = fit(at, surface2, 4.5, dir);
  t.accentSoft = oklch(mode === "light" ? 0.948 : 0.275, Math.min(C, 0.045), H);
  t.accentLine = oklch(mode === "light" ? 0.86 : 0.4, Math.min(C, 0.045), H);
  t.accentText = fit(at, t.accentSoft as string, 4.5, dir);
  const card = cardColors(brand);
  t.cardBg = card.bg;
  t.cardFg = card.fg;
  t.cardLabel = card.label;
  t.cardRing = card.ring;
  t.cardCorrected = card.corrected;
  return t as unknown as Theme;
}

const VAR: Record<string, string> = {
  bg: "bg",
  surface: "surface",
  surface2: "surface-2",
  line: "line",
  ink: "ink",
  ink2: "ink-2",
  ink3: "ink-3",
  accent: "accent",
  onAccent: "on-accent",
  accentEdge: "accent-edge",
  accentText: "accent-text",
  accentSoft: "accent-soft",
  accentLine: "accent-line",
  success: "success",
  successSoft: "success-soft",
  danger: "danger",
  dangerSoft: "danger-soft",
  warning: "warning",
  warningSoft: "warning-soft",
  cardBg: "card-bg",
  cardFg: "card-fg",
  cardLabel: "card-label",
  cardRing: "card-ring",
};

/** Variabili CSS (--lw-*) del tema, come nel design. */
export function themeVars(t: Theme): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, name] of Object.entries(VAR))
    out[`--lw-${name}`] = String((t as unknown as Record<string, unknown>)[k]);
  return out;
}

/* ---------- icone dei timbri (24×24, stroke) ---------- */

export const STAMP_ICONS = {
  scissors:
    '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12"/>',
  cup: '<path d="M4 9h12v4.5a5.5 5.5 0 0 1-5.5 5.5h-1A5.5 5.5 0 0 1 4 13.5z"/><path d="M16 10.5h1.5a2.75 2.75 0 0 1 0 5.5H16"/><path d="M8 3.5c-.7.9-.7 1.8 0 2.7M12 3.5c-.7.9-.7 1.8 0 2.7"/>',
  pizza:
    '<path d="M12 21 3.4 6.6a17 17 0 0 1 17.2 0z"/><path d="M5.3 9.8a13.5 13.5 0 0 1 13.4 0"/><circle cx="10.2" cy="12.6" r="1.1"/><circle cx="13.6" cy="15.6" r="1.1"/>',
  sparkle:
    '<path d="M11 3c.6 4.6 2.4 6.4 7 7-4.6.6-6.4 2.4-7 7-.6-4.6-2.4-6.4-7-7 4.6-.6 6.4-2.4 7-7z"/><path d="M19 15v5M16.5 17.5h5"/>',
  gift: '<rect x="3.5" y="8" width="17" height="4.2" rx="1"/><path d="M5 12.2V20h14v-7.8M12 8v12"/><path d="M12 8C10.6 5 7 4.4 7 6.6 7 8 9 8 12 8zM12 8c1.4-3 5-3.6 5-1.4C17 8 15 8 12 8z"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
} as const;
export type StampIcon = keyof typeof STAMP_ICONS;
export const STAMP_ICON_NAMES = Object.keys(STAMP_ICONS) as StampIcon[];

/* ---------- timbri ---------- */

export const FONT = "Bricolage Grotesque, Avenir Next, Segoe UI, sans-serif";
const angle = (i: number) => ((i * 37) % 25) - 12; // rotazione deterministica "timbro a mano"

function rosette(cx: number, cy: number, r: number): string {
  let d = "";
  for (let k = 0; k <= 120; k++) {
    const a = (2 * Math.PI * k) / 120;
    const rr = r * (0.9 + 0.1 * Math.cos(12 * a));
    d += (k ? "L" : "M") + (cx + rr * Math.cos(a)).toFixed(2) + " " + (cy + rr * Math.sin(a)).toFixed(2);
  }
  return `${d}Z`;
}

function iconAt(name: StampIcon, cx: number, cy: number, r: number, color: string, rot: number, k?: number): string {
  const s = (r * (k || 1.05)) / 24;
  return `<g transform="translate(${cx - 12 * s} ${cy - 12 * s}) scale(${s}) rotate(${rot} 12 12)" fill="none" stroke="${color}" stroke-width="${r < 14 ? 2.6 : 2.1}" stroke-linecap="round" stroke-linejoin="round">${STAMP_ICONS[name]}</g>`;
}

type StampState = "empty" | "filled" | "reward-empty" | "reward-filled";
interface StampOptions {
  fg: string;
  bg: string;
  ring: string;
  icon: StampIcon;
  numbers?: boolean;
  i: number;
}

function stamp(cx: number, cy: number, r: number, state: StampState, o: StampOptions): string {
  const sw = Math.max(1.5, r * 0.07);
  const small = r < 16;
  if (state === "filled") {
    return (
      `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${o.fg}"/>` +
      (small
        ? ""
        : `<circle cx="${cx}" cy="${cy}" r="${r * 0.8}" fill="none" stroke="${o.bg}" stroke-opacity=".45" stroke-width="${Math.max(1, r * 0.04)}"/>`) +
      iconAt(o.icon, cx, cy, r, o.bg, angle(o.i))
    );
  }
  if (state === "reward-filled")
    return `<path d="${rosette(cx, cy, r * 1.08)}" fill="${o.fg}"/>` + iconAt("gift", cx, cy, r, o.bg, 0, 1.1);
  if (state === "reward-empty") {
    return (
      `<path d="${rosette(cx, cy, r * 1.04 - sw / 2)}" fill="none" stroke="${o.ring}" stroke-width="${sw}"/>` +
      iconAt("gift", cx, cy, r, o.ring, 0, 0.95)
    );
  }
  const c = 2 * Math.PI * (r - sw / 2);
  const seg = c / (small ? 12 : 20);
  return (
    `<circle cx="${cx}" cy="${cy}" r="${r - sw / 2}" fill="none" stroke="${o.ring}" stroke-width="${sw}" stroke-dasharray="${(seg * 0.62).toFixed(2)} ${(seg * 0.38).toFixed(2)}"/>` +
    (o.numbers && r >= 14
      ? `<text x="${cx}" y="${cy}" dy=".35em" text-anchor="middle" font-family="${FONT}" font-weight="600" font-size="${(r * 0.62).toFixed(1)}" fill="${o.ring}">${o.i + 1}</text>`
      : "")
  );
}

/** N ≤ 6 → 1 riga; N 7–20 → 2 righe (riga alta = ceil(N/2)). */
export function gridLayout(nIn: number) {
  const n = Math.max(1, Math.min(20, nIn | 0));
  const rows = n <= 6 ? 1 : 2;
  const cols = Math.ceil(n / rows);
  return { rows, cols, perRow: rows === 1 ? [n] : [cols, n - cols] };
}

export interface StripOptions {
  n: number;
  filled: number;
  w: number;
  h: number;
  fg: string;
  ring: string;
  bg: string;
  icon: StampIcon;
  rewards?: number;
  numbers?: boolean;
  transparent?: boolean;
  padX?: number;
  padY?: number;
}

/** Griglia dei timbri come SVG (l'ultimo è il premio). */
export function strip(o: StripOptions): string {
  const n = o.n || 10;
  const f = Math.min(o.filled || 0, n);
  const { w, h } = o;
  const g = gridLayout(n);
  const px = o.padX ?? w * 0.05;
  const py = o.padY ?? h * 0.12;
  const cw = (w - 2 * px) / g.cols;
  const ch = (h - 2 * py) / g.rows;
  const r = Math.min(cw, ch) * 0.4;
  let s =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    (o.transparent ? "" : `<rect width="${w}" height="${h}" fill="${o.bg}"/>`);
  let i = 0;
  g.perRow.forEach((cnt, row) => {
    const x0 = px + ((g.cols - cnt) * cw) / 2;
    const cy = py + ch * (row + 0.5);
    for (let c = 0; c < cnt; c++, i++) {
      const last = i === n - 1;
      const st: StampState = last ? (f >= n ? "reward-filled" : "reward-empty") : i < f ? "filled" : "empty";
      s += stamp(x0 + cw * (c + 0.5), cy, r, st, { ...o, i });
    }
  });
  if ((o.rewards ?? 0) > 0 && f < n) {
    // premio in attesa mentre si raccolgono nuovi timbri
    const bh = h * 0.16;
    const bw = bh * 3.1;
    const bx = w - bw - h * 0.05;
    const by = h * 0.05;
    s +=
      `<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="${bh / 2}" fill="${o.fg}"/>` +
      iconAt("gift", bx + bh * 0.62, by + bh / 2, bh * 0.36, o.bg, 0) +
      `<text x="${bx + bh * 1.12}" y="${by + bh / 2}" dy=".35em" font-family="${FONT}" font-weight="700" font-size="${bh * 0.5}" fill="${o.bg}">${o.rewards} premio</text>`;
  }
  return `${s}</svg>`;
}

export const svgDataUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

const escapeXml = (s: string) => s.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Logo di riserva (monogramma) quando il negozio non carica un logo. */
export function monogram(name: string, bg: string, fg: string, size = 660): string {
  const ini = String(name)
    .replace(/^(bar|salone|pizzeria|studio|da)\s+/i, "")
    .split(/\s+/)
    .map((w) => w[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100"><rect width="100" height="100" fill="${bg}"/><circle cx="50" cy="50" r="38" fill="none" stroke="${fg}" stroke-opacity=".5" stroke-width="1.6"/><text x="50" y="50" dy=".35em" text-anchor="middle" font-family="${FONT}" font-weight="700" font-size="${ini.length > 1 ? 30 : 38}" fill="${fg}" letter-spacing="-1">${escapeXml(ini)}</text></svg>`;
}
