import { C, phone, screen, slamWords, whipOut, words } from "../ui.js";

/** 05 · Iscrizione: tre telefoni salgono uno per beat (modulo, codice SMS, carta pronta), poi il titolo. */
const STEPS = [
  { img: "cliente-04-form-compilato", label: "Nome e telefono", x: 330 },
  { img: "cliente-05-codice-sms", label: "Codice via SMS", x: 760 },
  { img: "cliente-06-carta-pronta-android", label: "Carta nel Wallet", x: 1190 },
];

export default function iscrizione({ el, tl, b }) {
  el.style.background = C.bg;
  el.innerHTML = `
    <div class="full group">
      <h2 class="k abs head" style="left:0;right:0;top:64px;text-align:center;font-size:104px;color:${C.ink}">Niente app da scaricare.</h2>
      ${STEPS.map(
        (s, i) => `<div class="abs step" style="left:${s.x}px;top:250px;width:400px">
          ${phone(screen(s.img), { width: 400, style: "position:relative" })}
          <div class="abs chip" style="left:-18px;top:-26px;display:flex;align-items:center;gap:12px;padding:12px 22px 12px 12px;border-radius:999px;
            background:${C.wine};color:${C.bg};font:700 30px var(--font);box-shadow:0 16px 30px -14px rgba(0,0,0,.5)">
            <b style="width:44px;height:44px;border-radius:50%;background:${C.bg};color:${C.wine};display:grid;place-items:center">${i + 1}</b>${s.label}
          </div>
        </div>`,
      ).join("")}
    </div>`;

  el.querySelectorAll(".step").forEach((step, i) => {
    tl.fromTo(step, { y: 900, rotation: 6 - i * 6 }, { y: 0, rotation: 0, duration: 0.6, ease: "expo.out" }, b(i));
    tl.fromTo(
      step.querySelector(".chip"),
      { scale: 0, rotation: -10 },
      { scale: 1, rotation: 0, duration: 0.4, ease: "back.out(2.5)" },
      b(i + 0.25),
    );
  });
  slamWords(tl, words(el.querySelector(".head")), b(3), 0.09);
  whipOut(tl, el.querySelector(".group"), b(5.5), { dir: -1 });
}
