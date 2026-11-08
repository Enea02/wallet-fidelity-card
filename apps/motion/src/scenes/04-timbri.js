import { C, fillStamps, punch, resetStamps, rng, slamWords, stampCard, whipOut, words } from "../ui.js";

/**
 * 04 · Timbri: la carta a tutto schermo, un timbro ogni mezzo beat, il premio sul beat 5 con coriandoli.
 * Esce con un whip verso l'alto.
 */
export default function timbri({ el, tl, b }) {
  el.style.background = C.bg;
  const rand = rng(4);
  const confetti = Array.from({ length: 36 }, () => {
    const size = 10 + rand() * 18;
    const color = [C.shop, C.wine, "#F2B33D", C.ok][Math.floor(rand() * 4)];
    return `<i class="abs bit" style="left:1300px;top:670px;width:${size}px;height:${size * 0.6}px;background:${color};border-radius:3px;visibility:hidden"></i>`;
  }).join("");
  el.innerHTML = `
    <div class="full group">
      <h2 class="k abs head" style="left:0;right:0;top:80px;text-align:center;font-size:96px;color:${C.ink}">Ogni timbro li riporta da te.</h2>
      ${stampCard({ width: 1000, style: "left:460px;top:290px" })}
      ${confetti}
    </div>`;

  const card = el.querySelector(".card");
  resetStamps(card);

  // continua la spinta della scena 03: la carta si assesta
  tl.fromTo(card, { scale: 1.25 }, { scale: 1, duration: b(1), ease: "expo.out" }, 0);
  // 9 timbri, uno ogni mezzo beat dal beat 0.5; il premio (decimo) cade sul beat 5
  fillStamps(tl, card, { at: b(0.5), every: b(0.5), count: 10 });
  punch(tl, card, b(5), 1.07);

  // coriandoli deterministici dal premio
  el.querySelectorAll(".bit").forEach((bit) => {
    const angle = rand() * Math.PI * 2;
    const dist = 250 + rand() * 650;
    tl.fromTo(
      bit,
      { x: 0, y: 0, rotation: 0, autoAlpha: 1, scale: 0.4, immediateRender: false },
      {
        x: Math.cos(angle) * dist,
        y: Math.sin(angle) * dist * 0.75 + 260,
        rotation: (rand() - 0.5) * 720,
        scale: 1,
        autoAlpha: 0,
        duration: 1.1 + rand() * 0.5,
        ease: "expo.out",
      },
      b(5),
    );
  });

  slamWords(tl, words(el.querySelector(".head")), b(5.25), 0.08);
  whipOut(tl, el.querySelector(".group"), b(7.5), { axis: "y", dir: -1 });
}
