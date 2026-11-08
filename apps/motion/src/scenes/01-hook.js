import { C, slamWords, words } from "../ui.js";

/** 01 · Hook: "La tessera di carta?" parola per parola, la tessera sbatte sul tavolo e cade. */
export default function hook({ el, tl, b }) {
  el.style.background = C.wine;
  const holes = Array.from({ length: 10 }, (_, i) => {
    const inked = i < 4;
    return `<div style="width:84px;height:84px;border-radius:50%;border:3px dashed ${C.ink2};display:grid;place-items:center;font:700 30px var(--font);color:${C.ink2}">
      ${inked ? `<div style="width:70px;height:70px;border-radius:50%;background:rgba(91,31,46,.82);transform:rotate(${i * 37}deg) scale(${0.9 + (i % 3) * 0.06})"></div>` : i + 1}
    </div>`;
  }).join("");
  el.innerHTML = `
    <h1 class="k abs title" style="left:0;right:0;top:150px;text-align:center;font-size:150px;color:${C.bg}">La tessera di carta?</h1>
    <div class="abs paper" style="left:610px;top:470px;width:700px;height:420px;border-radius:18px;background:#EFE4D2;
      box-shadow:0 40px 60px -30px rgba(0,0,0,.5);padding:44px 54px;display:flex;flex-direction:column;gap:34px">
      <div style="font:800 40px var(--font);color:${C.ink};letter-spacing:-.02em">Salone Demo <span style="font-weight:500;color:${C.ink2}">· tessera fedeltà</span></div>
      <div style="display:grid;grid-template-columns:repeat(5,1fr);row-gap:26px;justify-items:center">${holes}</div>
    </div>`;

  const title = el.querySelector(".title");
  const paper = el.querySelector(".paper");
  slamWords(tl, words(title), b(0), b(0.5));

  // la tessera sbatte sul beat 2 …
  tl.fromTo(
    paper,
    { scale: 2.4, rotation: 14, autoAlpha: 0 },
    { scale: 1, rotation: -5, autoAlpha: 1, duration: 0.16, ease: "power3.in" },
    b(2) - 0.16,
  );
  tl.fromTo(el, { x: 0, y: 0 }, { x: 10, y: -8, duration: 0.05, yoyo: true, repeat: 3, ease: "none" }, b(2));
  // … e cade fuori dall'inquadratura sull'ultimo mezzo beat
  tl.to(paper, { y: 900, rotation: 28, duration: b(1), ease: "power3.in" }, b(3));
  tl.to(title, { yPercent: -40, autoAlpha: 0, duration: b(0.75), ease: "power3.in" }, b(3.25));
}
