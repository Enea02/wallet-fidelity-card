/*
 * Pezzi riusabili delle scene: colori, icone, telefono, browser, carta a timbri, testo cinetico, transizioni.
 * Tutto restituisce HTML (stringhe) o aggiunge tween a una timeline: nessuno stato fuori dalla timeline.
 */
const gsap = window.gsap;

export const C = {
  bg: "#F6F2EC",
  surface: "#FFFDFA",
  ink: "#2A211C",
  ink2: "#6B5E55",
  line: "#DDD4CB",
  wine: "#5B1F2E",
  wineSoft: "#F1E3E5",
  /** colore del negozio demo che compare nelle schermate (Salone Demo) */
  shop: "#7C3AED",
  ok: "#1F7A4D",
};

/** Schermata reale del tutorial (docs/tutorial/img, rigenerate da apps/merchant/scripts/tutorial-screenshots.mjs). */
export const screen = (name) => `/screens/${name}.png`;

const svg = (size, color, body, stroke = 2) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
export const icon = {
  scissors: (s, c) =>
    svg(
      s,
      c,
      `<circle cx="6" cy="6" r="3"/><path d="M8.12 8.12 12 12"/><path d="M20 4 8.12 15.88"/><circle cx="6" cy="18" r="3"/><path d="M14.8 14.8 20 20"/>`,
    ),
  gift: (s, c) =>
    svg(
      s,
      c,
      `<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5"/>`,
    ),
};

/** Telefono con una schermata reale; le proporzioni seguono l'immagine. */
export const phone = (src, { width = 420, cls = "", style = "" } = {}) =>
  `<div class="phone ${cls}" style="width:${width}px;${style}"><div class="screen"><img src="${src}" alt=""></div></div>`;

/** Finestra del browser con una schermata reale (web app esercente). */
export const browser = (src, { width = 1400, cls = "", style = "" } = {}) =>
  `<div class="browser ${cls}" style="width:${width}px;${style}"><div class="bar"><i></i><i></i><i></i></div><div class="view"><img src="${src}" alt=""></div></div>`;

/** Carta a timbri: 9 caselle + premio. Si riempie con `fillStamps`. */
/** `letter`: iniziale del monogramma, come nelle schermate reali (Salone Demo → "D"). */
export function stampCard({
  width = 900,
  color = C.shop,
  shop = "Salone Demo",
  letter = "D",
  cls = "",
  style = "",
} = {}) {
  const cell = width * 0.12;
  const cells = Array.from({ length: 10 }, (_, i) => {
    const prize = i === 9;
    return `<div class="cell${prize ? " prize" : ""}">
      ${prize ? `<span class="n">${icon.gift(cell * 0.5, "#fff")}</span>` : `<span class="n">${i + 1}</span>`}
      <span class="fill"></span>
      <span class="on">${prize ? icon.gift(cell * 0.52, color) : icon.scissors(cell * 0.5, color)}</span>
      ${prize ? `<span class="ring"></span>` : ""}
    </div>`;
  }).join("");
  return `<div class="card ${cls}" style="--w:${width}px;--c:${color};${style}">
    <div class="head"><span class="logo"><b>${letter}</b>${shop}</span><span><span class="count">0</span> / 10</span></div>
    <div class="grid">${cells}</div>
  </div>`;
}

/** Stato iniziale della carta: tutte le caselle vuote. Chiamarla una volta dopo aver messo la carta nel DOM. */
export function resetStamps(card) {
  gsap.set(card.querySelectorAll(".fill, .on"), { scale: 0, autoAlpha: 0 });
  gsap.set(card.querySelectorAll(".ring"), { scale: 0.6, autoAlpha: 0 });
}

/**
 * Riempie i timbri sulla timeline: `count` timbri a partire da `at`, uno ogni `every` secondi.
 * Il decimo è il premio (anello che esplode). `filled` = timbri già presenti all'inizio.
 */
export function fillStamps(tl, card, { at, every, count = 10, filled = 0 }) {
  const cells = [...card.querySelectorAll(".cell")];
  const counter = card.querySelector(".count");
  // stato iniziale fuori dalla timeline (vedi CLAUDE.md: mai tl.set a tempo 0)
  for (let i = 0; i < filled; i++) {
    gsap.set(cells[i].querySelectorAll(".fill, .on"), { scale: 1, autoAlpha: 1 });
    gsap.set(cells[i].querySelector(".n"), { autoAlpha: 0 });
  }
  counter.textContent = String(filled);
  for (let k = 0; k < count && filled + k < 10; k++) {
    const i = filled + k;
    const t = at + k * every;
    const prize = i === 9;
    tl.set(cells[i].querySelector(".n"), { autoAlpha: 0 }, t);
    tl.fromTo(
      cells[i].querySelector(".fill"),
      { scale: 0, autoAlpha: 1 },
      { scale: 1, duration: prize ? 0.45 : 0.22, ease: prize ? "back.out(3)" : "back.out(2.6)" },
      t,
    );
    tl.fromTo(
      cells[i].querySelector(".on"),
      { scale: 0.2, rotation: -40, autoAlpha: 0 },
      { scale: 1, rotation: 0, autoAlpha: 1, duration: 0.3, ease: "back.out(2.2)" },
      t + 0.04,
    );
    tl.set(counter, { innerText: i + 1 }, t);
    if (prize) {
      tl.fromTo(
        cells[i].querySelector(".ring"),
        { scale: 0.8, autoAlpha: 1 },
        { scale: 3.2, autoAlpha: 0, duration: 0.7, ease: "expo.out" },
        t,
      );
    }
  }
}

/** Spezza un elemento di testo in parole (`.w`), ognuna in una maschera (`.mask`) per le entrate dal basso. */
export function words(el) {
  const parts = el.innerHTML.split(/(<br\s*\/?>|\s+)/i);
  el.innerHTML = parts
    .map((p) =>
      /^<br/i.test(p) ? p : /^\s+$/.test(p) ? " " : p ? `<span class="mask"><span class="w">${p}</span></span>` : "",
    )
    .join("");
  return [...el.querySelectorAll(".w")];
}

/** Entrata "slam" di parole dal basso, una per `step` secondi. */
export function slamWords(tl, ws, at, step = 0.12) {
  ws.forEach((w, i) =>
    tl.fromTo(
      w,
      { yPercent: 115, rotation: 4 },
      { yPercent: 0, rotation: 0, duration: 0.45, ease: "expo.out" },
      at + i * step,
    ),
  );
}

/** Generatore pseudo-casuale con seme: stessi valori a ogni render (mai Math.random nelle scene). */
export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Whip: uscita veloce con mosso (blur + skew). dir = 1 verso destra, -1 verso sinistra. */
export function whipOut(tl, target, at, { dir = -1, axis = "x", duration = 0.28 } = {}) {
  const move = axis === "x" ? { xPercent: 130 * dir, skewX: -25 * dir } : { yPercent: 130 * dir, skewY: 8 * dir };
  tl.to(target, { ...move, filter: "blur(28px)", duration, ease: "power4.in" }, at);
}

/** Whip in: entrata speculare a whipOut. */
export function whipIn(tl, target, at, { dir = 1, axis = "x", duration = 0.4 } = {}) {
  const from = axis === "x" ? { xPercent: -130 * dir, skewX: -25 * dir } : { yPercent: -130 * dir, skewY: 8 * dir };
  tl.fromTo(
    target,
    { ...from, filter: "blur(28px)" },
    { xPercent: 0, yPercent: 0, skewX: 0, skewY: 0, filter: "blur(0px)", duration, ease: "expo.out" },
    at,
  );
}

/** Colpo sul beat: piccolo scale-punch. */
export function punch(tl, target, at, amount = 1.06) {
  tl.fromTo(target, { scale: amount }, { scale: 1, duration: 0.35, ease: "expo.out" }, at);
}
