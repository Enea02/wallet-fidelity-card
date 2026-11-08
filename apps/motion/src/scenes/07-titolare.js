import { browser, C, screen, words } from "../ui.js";

const gsap = window.gsap;

/**
 * 07 · Titolare: la web app sale in prospettiva, la camera stringe sui numeri (beat 2),
 * taglio sui messaggi ai clienti (beat 4).
 */
export default function titolare({ el, tl, b, w }) {
  el.style.background = C.bg;
  el.innerHTML = `
    <div class="full persp" style="perspective:2200px">
      <div class="abs cam" style="left:0;top:0;width:1920px;height:1080px">
        ${browser(screen("titolare-01-panoramica"), { width: 1440, style: "left:240px;top:150px" })}
      </div>
    </div>
    <div class="abs label" style="left:110px;bottom:90px;padding:26px 44px;border-radius:28px;background:${C.wine};box-shadow:0 30px 60px -30px rgba(0,0,0,.6)">
      <h2 class="k t1" style="font-size:84px;color:${C.bg}">Vedi chi torna.</h2>
    </div>
    <div class="abs label2" style="left:110px;bottom:90px;padding:26px 44px;border-radius:28px;background:${C.wine};box-shadow:0 30px 60px -30px rgba(0,0,0,.6)">
      <h2 class="k t2" style="font-size:84px;color:${C.bg}">Richiamali con un messaggio.</h2>
    </div>`;

  const view = el.querySelector(".view");
  view.insertAdjacentHTML(
    "beforeend",
    `<img class="abs msg" src="${screen("titolare-10-messaggi")}" style="left:0;top:0;width:100%">`,
  );
  const win = el.querySelector(".browser");
  const cam = el.querySelector(".cam");
  const [label, label2] = [el.querySelector(".label"), el.querySelector(".label2")];

  // entrata in prospettiva
  tl.fromTo(
    win,
    { y: 520, rotationX: 38, scale: 0.86 },
    { y: 0, rotationX: 0, scale: 1, duration: b(1.5), ease: "expo.out" },
    0,
  );
  // beat 2: stretta sui numeri della panoramica (riquadri in alto)
  gsap.set(cam, { transformOrigin: "760px 330px" });
  tl.to(cam, { scale: 1.75, duration: b(1.75), ease: "expo.inOut" }, b(1.75));
  // l'etichetta entra quando la voce dice "vedi" (senza voce: beat 2)
  const vedi = w("vedi", 2);
  gsap.set(label, { autoAlpha: 0 });
  tl.fromTo(
    label,
    { y: 220, autoAlpha: 0 },
    { y: 0, autoAlpha: 1, duration: 0.45, ease: "expo.out", immediateRender: false },
    vedi,
  );
  tl.fromTo(
    words(el.querySelector(".t1")),
    { yPercent: 115 },
    { yPercent: 0, duration: 0.4, ease: "expo.out", stagger: 0.06 },
    vedi,
  );

  // beat 4: taglio sui messaggi, camera di nuovo larga
  gsap.set([el.querySelector(".msg"), label2], { autoAlpha: 0 });
  tl.set(el.querySelector(".msg"), { autoAlpha: 1 }, b(4));
  tl.set(cam, { scale: 1.12 }, b(4));
  tl.to(cam, { scale: 1, duration: b(2), ease: "power2.out" }, b(4));
  tl.set(label, { autoAlpha: 0 }, b(4));
  tl.set(label2, { autoAlpha: 1 }, b(4));
  tl.fromTo(
    words(el.querySelector(".t2")),
    { yPercent: 115 },
    { yPercent: 0, duration: 0.4, ease: "expo.out", stagger: 0.06 },
    b(4),
  );
}
