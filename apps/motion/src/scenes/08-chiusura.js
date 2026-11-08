import { C, icon, slamWords, words } from "../ui.js";

/** 08 · Chiusura: logo sul beat 0, nome, promessa, invito alla demo. Tiene fino alla fine del brano. */
export default function chiusura({ el, tl, b, w, dur }) {
  el.style.background = C.wine;
  el.innerHTML = `
    <div class="full center">
      <div class="group" style="display:flex;flex-direction:column;align-items:center;gap:40px">
        <div style="display:flex;align-items:center;gap:34px">
          <div class="logo" style="width:150px;height:150px;border-radius:50%;background:${C.bg};display:grid;place-items:center">${icon.gift(82, C.wine)}</div>
          <h1 class="k name" style="font-size:170px;color:${C.bg}">Loyalty Wallet</h1>
        </div>
        <h2 class="k claim" style="font-size:72px;font-weight:600;letter-spacing:-.02em;color:${C.bg};opacity:.92">Più clienti che tornano. Nessuna app da scaricare.</h2>
        <div class="cta" style="margin-top:24px;padding:26px 52px;border-radius:999px;background:${C.bg};color:${C.wine};font:700 46px var(--font)">Chiedici una demo con la carta del tuo negozio</div>
      </div>
    </div>`;

  tl.fromTo(
    el.querySelector(".logo"),
    { scale: 0, rotation: -120 },
    { scale: 1, rotation: 0, duration: 0.6, ease: "back.out(2)" },
    0,
  );
  slamWords(tl, words(el.querySelector(".name")), b(0.5), 0.1);
  slamWords(tl, words(el.querySelector(".claim")), w("piu", 2), 0.05);
  tl.fromTo(
    el.querySelector(".cta"),
    { y: 60, autoAlpha: 0 },
    { y: 0, autoAlpha: 1, duration: 0.5, ease: "expo.out" },
    b(4),
  );
  // respiro lento fino alla fine, così l'ultima inquadratura non è mai ferma
  tl.fromTo(el.querySelector(".group"), { scale: 1 }, { scale: 1.035, duration: dur, ease: "none" }, 0);
}
