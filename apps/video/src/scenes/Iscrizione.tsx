import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { rise } from "../ui/motion";
import { Crop, Phone, Slideshow } from "../ui/Screens";
import { Eyebrow, Steps, Title } from "../ui/Text";
import { C, FONT } from "../ui/theme";

// schermate da Android (Pixel 7, 412 × 839 punti)
const ANDROID = 824 / 1678;

/** Dal cartello al Wallet: i tre passi del cliente, con le schermate vere del web di iscrizione. */
export function Iscrizione() {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: C.bg, flexDirection: "row", alignItems: "center", padding: "0 140px", gap: 70 }}>
      <div style={{ flex: "0 0 780px", display: "grid", gap: 40 }}>
        <div style={{ display: "grid", gap: 22 }}>
          <Eyebrow>Per i tuoi clienti</Eyebrow>
          <Title size={74}>Si iscrivono da soli, al bancone.</Title>
        </div>
        <Steps
          steps={[
            { text: "Inquadrano il QR del cartello", at: 0 },
            { text: "Scrivono nome e telefono e confermano con il codice SMS", at: 150 },
            { text: "Salvano la carta nel Wallet: si aggiorna da sola a ogni timbro", at: 330 },
          ]}
        />
        <div style={{ fontFamily: FONT, fontSize: 24, color: C.ink2, ...rise(frame, 340, 10) }}>
          Google Wallet · Apple Wallet in arrivo (su iPhone intanto QR e codice da mostrare in cassa)
        </div>
      </div>
      <div
        style={{ flex: 1, position: "relative", display: "flex", justifyContent: "flex-end", ...rise(frame, 6, 60) }}
      >
        <Cartello />
        <Phone width={460} aspect={ANDROID}>
          <Slideshow
            screens={[
              { file: "cliente-02-iscrizione", at: 0 },
              { file: "cliente-04-form-compilato", at: 150 },
              { file: "cliente-05-codice-sms", at: 240 },
              { file: "cliente-06-carta-pronta-android", at: 330 },
            ]}
          />
        </Phone>
      </div>
    </AbsoluteFill>
  );
}

/** Il cartello A5 vero (ritagliato dalla sua pagina /salone-demo/qr), accanto al telefono durante il primo passo. */
function Cartello() {
  const frame = useCurrentFrame();
  const enter = rise(frame, 0, 40);
  // esce scivolando verso il telefono quando il cliente passa al modulo
  const out = interpolate(frame, [135, 165], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div
      style={{
        position: "absolute",
        left: 10,
        top: 150,
        borderRadius: 10,
        overflow: "hidden",
        boxShadow: "0 30px 60px -30px rgba(42,33,28,0.5)",
        transform: `translateX(${out * 120}px) rotate(-6deg) ${enter.transform}`,
        opacity: Number(enter.opacity) * (1 - out),
      }}
    >
      {/* area del foglio A5 nello screenshot di 1920 × 1353 px */}
      <Crop file="cliente-01-cartello" imageWidth={1920} crop={{ x: 540, y: 125, w: 840, h: 1190 }} width={300} />
    </div>
  );
}
