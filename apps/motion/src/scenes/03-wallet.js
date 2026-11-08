import { C, resetStamps, slamWords, stampCard, words } from "../ui.js";

const gsap = window.gsap;

/**
 * 03 · Rivelazione: un cerchio color carta si apre dal centro, la carta del negozio cade nel Wallet del telefono,
 * "Nel Wallet. Sempre in tasca." Alla fine la camera spinge dentro la carta (raccordo con la scena 04).
 */
export default function wallet({ el, tl, b, w, dur }) {
  el.style.background = C.wine;
  el.innerHTML = `
    <div class="full disc" style="background:${C.bg}"></div>
    <div class="full cam">
      <div class="abs copy" style="left:130px;top:340px">
        <h2 class="k l1" style="font-size:128px;color:${C.ink}">Nel Wallet.</h2>
        <h2 class="k l2" style="font-size:128px;color:${C.wine};margin-top:18px">Sempre in tasca.</h2>
      </div>
      <div class="phone hand" style="left:1230px;top:110px;width:470px;height:960px">
        <div class="screen" style="height:100%;background:#F2F0F4;padding:70px 22px 0">
          <div style="font:800 46px var(--font);color:${C.ink};letter-spacing:-.03em;margin:0 8px 26px">Wallet</div>
          <div class="slot" style="position:relative;height:240px"></div>
          <div style="height:120px;border-radius:24px;background:#DCD7E0;margin-top:22px"></div>
          <div style="height:120px;border-radius:24px;background:#E6E2EA;margin-top:-80px;transform:scale(.96)"></div>
        </div>
      </div>
    </div>`;

  el.querySelector(".slot").innerHTML = stampCard({ width: 404, style: "left:0;top:0" });
  const card = el.querySelector(".card");
  resetStamps(card);

  // apertura a cerchio dal centro sul beat 0
  tl.fromTo(
    el.querySelector(".disc"),
    { clipPath: "circle(0% at 50% 50%)" },
    { clipPath: "circle(75% at 50% 50%)", duration: b(1), ease: "expo.inOut" },
    0,
  );
  tl.fromTo(
    el.querySelector(".hand"),
    { y: 700, rotation: 8 },
    { y: 0, rotation: 0, duration: b(1.2), ease: "expo.out" },
    b(0.3),
  );
  // la carta cade nel Wallet sul beat 1
  tl.fromTo(card, { y: -900, rotation: -12 }, { y: 0, rotation: 0, duration: b(0.8), ease: "back.out(1.3)" }, b(1));
  // il testo entra quando la voce lo dice (senza voce: sui beat 1.5 e 2.5)
  slamWords(tl, words(el.querySelector(".l1")), w("nel", 1.5), 0.1);
  slamWords(tl, words(el.querySelector(".l2")), w("sempre", 2.5), 0.1);

  // spinta della camera dentro la carta: diventa la carta a tutto schermo della scena 04
  const cam = el.querySelector(".cam");
  gsap.set(cam, { transformOrigin: "1465px 395px" });
  tl.to(cam, { scale: 2.6, duration: dur - b(4), ease: "expo.in" }, b(4));
  tl.to(el.querySelector(".copy"), { autoAlpha: 0, duration: b(0.75), ease: "power2.in" }, b(4));
}
