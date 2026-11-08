import { C, phone, punch, screen, whipIn, words } from "../ui.js";

const gsap = window.gsap;

/** 06 · In cassa: il telefono dell'operatore entra di lato, la schermata cambia sui beat 2 e 4 (scanner → timbro → premio). */
const LINES = [
  { at: 0, text: "Inquadri il QR." },
  { at: 2, text: "Un tocco: timbro dato." },
  { at: 4, text: "Al decimo, il premio." },
];
const SHOTS = [
  { at: 0, img: "cassa-02-scanner-codice" },
  { at: 2, img: "cassa-04-timbro-dato" },
  { at: 4, img: "cassa-08-premio-sbloccato" },
];

export default function cassa({ el, tl, b }) {
  el.style.background = C.wine;
  el.innerHTML = `
    <div class="abs lines" style="left:150px;top:300px;display:flex;flex-direction:column;gap:30px">
      ${LINES.map((l) => `<h2 class="k line" style="font-size:96px;color:${C.bg}">${l.text}</h2>`).join("")}
    </div>
    <div class="abs device" style="left:1230px;top:120px;width:500px">
      ${phone(screen(SHOTS[0].img), { width: 500, style: "position:relative" })}
    </div>
    <div class="full flash" style="background:#fff"></div>`;

  // le altre schermate sovrapposte nello stesso telefono
  const scr = el.querySelector(".screen");
  for (const s of SHOTS.slice(1))
    scr.insertAdjacentHTML("beforeend", `<img class="abs alt" src="${screen(s.img)}" style="left:0;top:0;width:100%">`);
  const alts = [...scr.querySelectorAll(".alt")];
  const device = el.querySelector(".device");
  const flash = el.querySelector(".flash");
  gsap.set(flash, { autoAlpha: 0 });

  whipIn(tl, device, 0, { dir: -1 });
  alts.forEach((img, i) => {
    const at = b(SHOTS[i + 1].at);
    gsap.set(img, { autoAlpha: 0 });
    tl.set(img, { autoAlpha: 1 }, at);
    tl.fromTo(
      flash,
      { autoAlpha: 0.55 },
      { autoAlpha: 0, duration: 0.25, ease: "power2.out", immediateRender: false },
      at,
    );
    punch(tl, device, at, 1.05);
  });

  // ogni frase entra sul suo beat, le precedenti si spengono
  el.querySelectorAll(".line").forEach((line, i) => {
    const at = b(LINES[i].at);
    const ws = words(line);
    tl.fromTo(ws, { yPercent: 115 }, { yPercent: 0, duration: 0.45, ease: "expo.out", stagger: 0.06 }, at);
    if (i > 0) tl.to(el.querySelectorAll(".line")[i - 1], { opacity: 0.3, duration: 0.2 }, at);
  });
}
