import { C } from "../ui.js";

const gsap = window.gsap;

/** 02 · Problema: un cartello a schermo intero per beat, sfondi alternati, l'ultimo barrato. */
const CARDS = [
  { at: 0, text: "Si perde.", bg: C.bg, fg: C.ink },
  { at: 1, text: "Si rovina.", bg: C.wine, fg: C.bg },
  { at: 2, text: "Si dimentica.", bg: C.bg, fg: C.ink },
  { at: 3, text: "E l'app del negozio?", bg: C.ink, fg: C.bg },
  { at: 4.5, text: "Non la scarica nessuno.", bg: C.wine, fg: C.bg, strike: true },
];

export default function problema({ el, tl, b, dur }) {
  el.innerHTML = CARDS.map(
    (c) => `<div class="full center panel" style="background:${c.bg}">
      <h2 class="k" style="position:relative;font-size:${c.text.length > 14 ? 140 : 200}px;color:${c.fg}">${c.text}
        ${c.strike ? `<span class="strike abs" style="left:-1%;top:52%;height:14px;width:102%;background:${C.bg};border-radius:7px;transform-origin:left center"></span>` : ""}
      </h2>
    </div>`,
  ).join("");

  const panels = [...el.querySelectorAll(".panel")];
  panels.forEach((p, i) => {
    const start = b(CARDS[i].at);
    const end = i + 1 < CARDS.length ? b(CARDS[i + 1].at) : dur;
    const h = p.querySelector("h2");
    // il primo cartello è visibile da subito, gli altri si accendono sul loro beat
    if (i > 0) {
      gsap.set(p, { autoAlpha: 0 });
      tl.set(p, { autoAlpha: 1 }, start);
    }
    if (i + 1 < CARDS.length) tl.set(p, { autoAlpha: 0 }, end);
    // colpo d'entrata + deriva lenta finché resta a schermo
    tl.fromTo(
      h,
      { scale: 1.35, filter: "blur(12px)" },
      { scale: 1, filter: "blur(0px)", duration: 0.22, ease: "expo.out" },
      start,
    );
    tl.to(h, { scale: 0.96, duration: Math.max(0.05, end - start - 0.22), ease: "none" }, start + 0.22);
    const strike = p.querySelector(".strike");
    if (strike)
      tl.fromTo(strike, { scaleX: 0 }, { scaleX: 1, duration: 0.25, ease: "expo.out" }, b(CARDS[i].at + 0.75));
  });
}
