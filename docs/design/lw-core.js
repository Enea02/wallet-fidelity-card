/* Loyalty Wallet — core di riferimento (porting 1:1 in Next.js / satori).
   - theme(brandHex, mode): deriva tutti i token dal colore del negozio con garanzia WCAG AA
   - strip(...): griglia timbri come SVG (stesse regole per Google hero e Apple strip)
   - gridLayout(n): righe/colonne per N timbri (5–20) */
(function () {
  const hexToRgb = (h) => { h = h.replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); const n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => v / 255); };
  const toLin = c => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  const fromLin = c => c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(Math.max(c, 0), 1 / 2.4) - 0.055;
  const rgbToHex = rgb => '#' + rgb.map(v => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
  function rgbToOklch(rgb) {
    const [r, g, b] = rgb.map(toLin);
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b), m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b), s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
    return [L, Math.hypot(A, B), (Math.atan2(B, A) * 180 / Math.PI + 360) % 360];
  }
  function oklchToRgb(L, C, H) {
    const a = C * Math.cos(H * Math.PI / 180), b = C * Math.sin(H * Math.PI / 180);
    const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3, m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3, s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
    return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s].map(fromLin);
  }
  const inGamut = rgb => rgb.every(v => v >= -0.001 && v <= 1.001);
  function oklch(L, C, H) {
    let rgb = oklchToRgb(L, C, H);
    if (!inGamut(rgb)) { let lo = 0, hi = C; for (let i = 0; i < 18; i++) { const mid = (lo + hi) / 2; if (inGamut(oklchToRgb(L, mid, H))) lo = mid; else hi = mid; } rgb = oklchToRgb(L, lo, H); }
    return rgbToHex(rgb);
  }
  const lum = hex => { const [r, g, b] = hexToRgb(hex).map(toLin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const mix = (a, b, t) => { const A = hexToRgb(a), B = hexToRgb(b); return rgbToHex(A.map((v, i) => v * (1 - t) + B[i] * t)); };
  const norm = h => { h = String(h || '').trim(); if (!h.startsWith('#')) h = '#' + h; return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(h) ? rgbToHex(hexToRgb(h)) : '#5B1F2E'; };
  // sposta la luminosità (OKLCH L) finché il contrasto con "against" raggiunge target
  function fit(hex, against, target, dir) {
    let [L, C, H] = rgbToOklch(hexToRgb(hex)), out = hex, i = 0;
    while (contrast(out, against) < target && i++ < 100) { L = Math.min(1, Math.max(0, L + dir * 0.01)); out = oklch(L, C, H); }
    return out;
  }
  const WHITE = '#FFFFFF', INK = '#1E1915';
  const onColor = c => contrast(c, WHITE) >= contrast(c, INK) ? WHITE : INK;
  const bestOn = c => Math.max(contrast(c, WHITE), contrast(c, INK));

  const NEUTRAL = {
    light: { bg: [.968, .011, 78], surface: [.995, .004, 85], surface2: [.938, .013, 75], line: [.874, .016, 70], ink: [.235, .018, 55], ink2: [.445, .02, 58], ink3: [.62, .018, 62] },
    dark: { bg: [.175, .009, 60], surface: [.215, .011, 60], surface2: [.258, .012, 60], line: [.335, .013, 60], ink: [.955, .009, 80], ink2: [.775, .014, 72], ink3: [.58, .014, 68] }
  };
  const SEM = {
    light: { success: [.48, .12, 150], danger: [.5, .18, 28], warning: [.5, .11, 70], successSoft: [.95, .035, 150], dangerSoft: [.95, .03, 28], warningSoft: [.95, .045, 85] },
    dark: { success: [.8, .13, 150], danger: [.76, .14, 28], warning: [.84, .12, 85], successSoft: [.27, .04, 150], dangerSoft: [.27, .045, 28], warningSoft: [.28, .04, 80] }
  };

  // carta wallet: un solo colore, indipendente dalla modalità del telefono
  function cardColors(brand) {
    let bg = brand;
    if (bestOn(bg) < 4.5) bg = fit(bg, WHITE, 4.5, -1); // toni medi: scurisci il minimo indispensabile
    const fg = onColor(bg);
    let t = 0.4; while (t > 0 && contrast(mix(fg, bg, t), bg) < 4.5) t -= 0.02;
    let r = 0.62; while (r > 0 && contrast(mix(fg, bg, r), bg) < 3) r -= 0.02;
    return { bg, fg, label: mix(fg, bg, Math.max(t, 0)), ring: mix(fg, bg, Math.max(r, 0)), corrected: bg !== brand };
  }

  function theme(brandIn, mode) {
    mode = mode === 'dark' ? 'dark' : 'light';
    const brand = norm(brandIn); const [, C, H] = rgbToOklch(hexToRgb(brand));
    const t = { brand, mode };
    for (const k in NEUTRAL[mode]) t[k] = oklch(...NEUTRAL[mode][k]);
    for (const k in SEM[mode]) t[k] = oklch(...SEM[mode][k]);
    const dir = mode === 'light' ? -1 : 1;
    // accent: riempimento pulsanti. Testo sopra ≥4.5, e in dark ≥3 contro lo sfondo
    let accent = brand, [L] = rgbToOklch(hexToRgb(brand)), i = 0;
    const ok = c => bestOn(c) >= 4.5 && (mode === 'light' || contrast(c, t.bg) >= 3);
    if (!ok(accent)) {
      const d = mode === 'dark' && contrast(brand, t.bg) < 3 ? 1 : (onColor(brand) === WHITE ? -1 : 1);
      while (!ok(accent) && i++ < 100) { L += d * 0.01; accent = oklch(L, C, H); }
    }
    t.accent = accent; t.onAccent = onColor(accent);
    t.accentEdge = contrast(accent, t.bg) >= 3 ? accent : fit(accent, t.bg, 3, dir);
    let at = fit(oklch(rgbToOklch(hexToRgb(brand))[0], Math.min(C, 0.17), H), t.bg, 4.6, dir);
    at = fit(at, mode === 'light' ? t.surface2 : t.surface2, 4.5, dir);
    t.accentSoft = oklch(mode === 'light' ? .948 : .275, Math.min(C, .045), H);
    t.accentLine = oklch(mode === 'light' ? .86 : .40, Math.min(C, .045), H);
    t.accentText = fit(at, t.accentSoft, 4.5, dir);
    const card = cardColors(brand);
    t.cardBg = card.bg; t.cardFg = card.fg; t.cardLabel = card.label; t.cardRing = card.ring; t.cardCorrected = card.corrected;
    t.report = {
      accentOn: +contrast(t.accent, t.onAccent).toFixed(2), accentTextBg: +contrast(t.accentText, t.bg).toFixed(2),
      accentTextSoft: +contrast(t.accentText, t.accentSoft).toFixed(2), cardFg: +contrast(t.cardFg, t.cardBg).toFixed(2),
      cardLabel: +contrast(t.cardLabel, t.cardBg).toFixed(2), cardRing: +contrast(t.cardRing, t.cardBg).toFixed(2), inkBg: +contrast(t.ink, t.bg).toFixed(2), ink2Bg: +contrast(t.ink2, t.bg).toFixed(2)
    };
    return t;
  }
  const VAR = { bg: 'bg', surface: 'surface', surface2: 'surface-2', line: 'line', ink: 'ink', ink2: 'ink-2', ink3: 'ink-3', accent: 'accent', onAccent: 'on-accent', accentEdge: 'accent-edge', accentText: 'accent-text', accentSoft: 'accent-soft', accentLine: 'accent-line', success: 'success', successSoft: 'success-soft', danger: 'danger', dangerSoft: 'danger-soft', warning: 'warning', warningSoft: 'warning-soft', cardBg: 'card-bg', cardFg: 'card-fg', cardLabel: 'card-label', cardRing: 'card-ring' };
  function vars(t) { const o = { colorScheme: t.mode }; for (const k in VAR) o['--lw-' + VAR[k]] = t[k]; o.color = t.ink; return o; }

  // ---------- icone (24×24, stroke) ----------
  const ICONS = {
    scissors: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12"/>',
    cup: '<path d="M4 9h12v4.5a5.5 5.5 0 0 1-5.5 5.5h-1A5.5 5.5 0 0 1 4 13.5z"/><path d="M16 10.5h1.5a2.75 2.75 0 0 1 0 5.5H16"/><path d="M8 3.5c-.7.9-.7 1.8 0 2.7M12 3.5c-.7.9-.7 1.8 0 2.7"/>',
    pizza: '<path d="M12 21 3.4 6.6a17 17 0 0 1 17.2 0z"/><path d="M5.3 9.8a13.5 13.5 0 0 1 13.4 0"/><circle cx="10.2" cy="12.6" r="1.1"/><circle cx="13.6" cy="15.6" r="1.1"/>',
    sparkle: '<path d="M11 3c.6 4.6 2.4 6.4 7 7-4.6.6-6.4 2.4-7 7-.6-4.6-2.4-6.4-7-7 4.6-.6 6.4-2.4 7-7z"/><path d="M19 15v5M16.5 17.5h5"/>',
    gift: '<rect x="3.5" y="8" width="17" height="4.2" rx="1"/><path d="M5 12.2V20h14v-7.8M12 8v12"/><path d="M12 8C10.6 5 7 4.4 7 6.6 7 8 9 8 12 8zM12 8c1.4-3 5-3.6 5-1.4C17 8 15 8 12 8z"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>'
  };
  const iconSVG = (name, color, size, sw) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${sw || 2}" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ICONS.check}</svg>`;

  // ---------- timbri ----------
  const FONT = "Bricolage Grotesque, Avenir Next, Segoe UI, sans-serif";
  const angle = i => ((i * 37) % 25) - 12; // rotazione deterministica "timbro a mano"
  function rosette(cx, cy, r) { let d = ''; for (let k = 0; k <= 120; k++) { const a = 2 * Math.PI * k / 120, rr = r * (0.9 + 0.1 * Math.cos(12 * a)); d += (k ? 'L' : 'M') + (cx + rr * Math.cos(a)).toFixed(2) + ' ' + (cy + rr * Math.sin(a)).toFixed(2); } return d + 'Z'; }
  function iconAt(name, cx, cy, r, color, rot, k) {
    const s = r * (k || 1.05) / 24; return `<g transform="translate(${cx - 12 * s} ${cy - 12 * s}) scale(${s}) rotate(${rot} 12 12)" fill="none" stroke="${color}" stroke-width="${r < 14 ? 2.6 : 2.1}" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</g>`;
  }
  // state: empty | filled | reward-empty | reward-filled
  function stamp(cx, cy, r, state, o) {
    const sw = Math.max(1.5, r * 0.07), small = r < 16;
    if (state === 'filled') return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${o.fg}"/>` + (small ? '' : `<circle cx="${cx}" cy="${cy}" r="${r * 0.8}" fill="none" stroke="${o.bg}" stroke-opacity=".45" stroke-width="${Math.max(1, r * 0.04)}"/>`) + iconAt(o.icon, cx, cy, r, o.bg, angle(o.i));
    if (state === 'reward-filled') return `<path d="${rosette(cx, cy, r * 1.08)}" fill="${o.fg}"/>` + iconAt('gift', cx, cy, r, o.bg, 0, 1.1);
    if (state === 'reward-empty') return `<path d="${rosette(cx, cy, r * 1.04 - sw / 2)}" fill="none" stroke="${o.ring}" stroke-width="${sw}"/>` + iconAt('gift', cx, cy, r, o.ring, 0, 0.95);
    const c = 2 * Math.PI * (r - sw / 2), seg = c / (small ? 12 : 20);
    return `<circle cx="${cx}" cy="${cy}" r="${r - sw / 2}" fill="none" stroke="${o.ring}" stroke-width="${sw}" stroke-dasharray="${(seg * 0.62).toFixed(2)} ${(seg * 0.38).toFixed(2)}"/>` + (o.numbers && r >= 14 ? `<text x="${cx}" y="${cy}" dy=".35em" text-anchor="middle" font-family="${FONT}" font-weight="600" font-size="${(r * 0.62).toFixed(1)}" fill="${o.ring}">${o.i + 1}</text>` : '');
  }
  // regola griglia: N ≤ 6 → 1 riga; N 7–20 → 2 righe (riga alta = ceil(N/2))
  function gridLayout(n) { n = Math.max(1, Math.min(20, n | 0)); const rows = n <= 6 ? 1 : 2, cols = Math.ceil(n / rows); return { rows, cols, perRow: rows === 1 ? [n] : [cols, n - cols] }; }
  /* strip({n, filled, w, h, fg, ring, bg, icon, rewards, numbers, pad}) → stringa SVG */
  function strip(o) {
    const n = o.n || 10, f = Math.min(o.filled || 0, n), w = o.w, h = o.h, g = gridLayout(n);
    const px = o.padX ?? w * 0.05, py = o.padY ?? h * 0.12;
    const cw = (w - 2 * px) / g.cols, ch = (h - 2 * py) / g.rows, r = Math.min(cw, ch) * 0.4;
    let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` + (o.transparent ? '' : `<rect width="${w}" height="${h}" fill="${o.bg}"/>`);
    let i = 0;
    g.perRow.forEach((cnt, row) => {
      const x0 = px + (g.cols - cnt) * cw / 2, cy = py + ch * (row + 0.5);
      for (let c = 0; c < cnt; c++, i++) {
        const last = i === n - 1, st = last ? (f >= n ? 'reward-filled' : 'reward-empty') : (i < f ? 'filled' : 'empty');
        s += stamp(x0 + cw * (c + 0.5), cy, r, st, { ...o, i });
      }
    });
    if (o.rewards > 0 && f < n) { // premio in attesa mentre si raccolgono nuovi timbri
      const bh = h * 0.16, bw = bh * 3.1, bx = w - bw - h * 0.05, by = h * 0.05;
      s += `<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="${bh / 2}" fill="${o.fg}"/>` + iconAt('gift', bx + bh * 0.62, by + bh / 2, bh * 0.36, o.bg, 0) + `<text x="${bx + bh * 1.12}" y="${by + bh / 2}" dy=".35em" font-family="${FONT}" font-weight="700" font-size="${bh * 0.5}" fill="${o.bg}">${o.rewards} premio</text>`;
    }
    return s + '</svg>';
  }
  const url = svg => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  function stampURL(state, size, o) { const r = size / 2 - 1; return url(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${stamp(size / 2, size / 2, state === 'reward-filled' ? r / 1.08 : r, state, { i: o.i || 2, ...o })}</svg>`); }

  // ---------- QR (finto, solo mockup) ----------
  function qr(seed, fg, bg) {
    let a = seed | 0 || 7; const rnd = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    const N = 25, q = 2, S = N + 2 * q; let d = '';
    const finder = (x, y) => x < 8 && y < 8 || x >= N - 8 && y < 8 || x < 8 && y >= N - 8;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { if (finder(x, y)) continue; if (rnd() < 0.5) d += `M${x + q} ${y + q}h1v1h-1z`; }
    const f = (x, y) => `M${x + q} ${y + q}h7v7h-7zM${x + q + 1} ${y + q + 1}v5h5v-5zM${x + q + 2} ${y + q + 2}h3v3h-3z`;
    return url(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" shape-rendering="crispEdges"><rect width="${S}" height="${S}" fill="${bg || '#fff'}"/><path fill="${fg || '#111'}" fill-rule="evenodd" d="${d}${f(0, 0)}${f(N - 7, 0)}${f(0, N - 7)}"/></svg>`);
  }
  // ---------- logo di riserva (monogramma) quando il negozio non carica un logo ----------
  function monogram(name, bg, fg, size) {
    size = size || 660; const ini = String(name).replace(/^(bar|salone|pizzeria|studio|da)\s+/i, '').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
    return url(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100"><rect width="100" height="100" fill="${bg}"/><circle cx="50" cy="50" r="38" fill="none" stroke="${fg}" stroke-opacity=".5" stroke-width="1.6"/><text x="50" y="50" dy=".35em" text-anchor="middle" font-family="${FONT}" font-weight="700" font-size="${ini.length > 1 ? 30 : 38}" fill="${fg}" letter-spacing="-1">${ini}</text></svg>`);
  }

  const presets = {
    salone: { key: 'salone', shop: 'Salone Nora', program: 'Carta Amica', brand: '#5B1F2E', icon: 'scissors', n: 10, reward: 'Taglio gratis', unit: 'taglio', unitPl: 'tagli', slug: 'salone-nora', category: 'Parrucchiere' },
    bar: { key: 'bar', shop: 'Bar Girasole', program: 'Colazione Club', brand: '#F7C843', icon: 'cup', n: 8, reward: 'Colazione gratis', unit: 'colazione', unitPl: 'colazioni', slug: 'bar-girasole', category: 'Bar' },
    pizzeria: { key: 'pizzeria', shop: 'Pizzeria Da Gino', program: 'Amici di Gino', brand: '#C8412B', icon: 'pizza', n: 12, reward: 'Margherita gratis', unit: 'pizza', unitPl: 'pizze', slug: 'da-gino', category: 'Pizzeria' },
    estetica: { key: 'estetica', shop: 'Studio Iris', program: 'Iris Beauty', brand: '#7FA89A', icon: 'sparkle', n: 6, reward: 'Trattamento viso gratis', unit: 'trattamento', unitPl: 'trattamenti', slug: 'studio-iris', category: 'Estetista' }
  };

  // <lw-img src> : unknown tag, so the browser never fetches an unbound "{{ }}" src
  if (window.customElements && !customElements.get('lw-img')) customElements.define('lw-img', class extends HTMLElement {
    static get observedAttributes() { return ['src', 'alt']; }
    connectedCallback() { if (!this.style.display) this.style.display = 'block'; this.r(); }
    attributeChangedCallback() { this.r(); }
    r() {
      const s = this.getAttribute('src'); if (!s || s.indexOf('{{') >= 0) return;
      const st = this.style; st.backgroundImage = 'url("' + s.replace(/"/g, '%22') + '")'; st.backgroundSize = '100% 100%'; st.backgroundRepeat = 'no-repeat';
      let dec = ''; const e = s.indexOf('%3E'); try { dec = decodeURIComponent(s.slice(0, e > 0 ? e + 3 : 300)); } catch (x) {}
      const m = /<svg[^>]*?width="([\d.]+)"[^>]*?height="([\d.]+)"/.exec(dec);
      if (m) { st.aspectRatio = m[1] + ' / ' + m[2]; if (!st.width && !st.height) st.width = m[1] + 'px'; }
      this.setAttribute('role', 'img'); this.setAttribute('aria-label', this.getAttribute('alt') || '');
    }
  });
  window.LW = { theme, vars, cardColors, contrast, mix, oklch, rgbToOklch, hexToRgb, norm, strip, stamp, stampURL, gridLayout, url, qr, monogram, iconSVG, ICONS, presets, FONT };
})();
