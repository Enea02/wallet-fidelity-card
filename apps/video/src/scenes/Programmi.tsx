import { AbsoluteFill, useCurrentFrame } from "remotion";
import { Crop } from "../ui/Screens";
import { rise } from "../ui/motion";
import { Eyebrow, Title } from "../ui/Text";
import { C, FONT } from "../ui/theme";

// riquadri delle schede: nome e saldo della carta sul telefono, scheda in cassa su computer (1920 × 1200)
const CARTA = { x: 40, y: 150, w: 720, h: 566 };
const CASSA_DESKTOP = { x: 700, y: 70, w: 890, h: 700 };

const PROGRAMMI = [
  {
    title: "Timbri",
    line: "Es. 10 tagli, uno è gratis",
    file: "cassa-07-carta-quasi-completa",
    imageWidth: 780,
    crop: CARTA,
  },
  {
    title: "Punti e livelli",
    line: "1 punto per euro, da Silver a Platinum",
    file: "punti-03-nuovo-livello",
    imageWidth: 1920,
    crop: CASSA_DESKTOP,
  },
  {
    title: "Tessere prepagate",
    line: "Un carnet che si scala a ogni uso",
    file: "tessere-06-carnet-scalato",
    imageWidth: 1920,
    crop: CASSA_DESKTOP,
  },
  {
    title: "Abbonamenti",
    line: "Un vantaggio valido fino alla scadenza",
    file: "tessere-07-abbonamento-valido",
    imageWidth: 1920,
    crop: CASSA_DESKTOP,
  },
];

const CARD_W = (1920 - 280 - 32 * 3) / 4;

/** I quattro programmi che un negozio può offrire, ognuno con la sua schermata in cassa. */
export function Programmi() {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: C.bg, padding: "110px 140px", gap: 56 }}>
      <div style={{ display: "grid", gap: 20 }}>
        <Eyebrow>Il programma giusto per il tuo negozio</Eyebrow>
        <Title size={72}>Timbri, punti, tessere e abbonamenti.</Title>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 32 }}>
        {PROGRAMMI.map((p, i) => (
          <div
            key={p.title}
            style={{
              background: C.surface,
              border: `1px solid ${C.line}`,
              borderRadius: 24,
              overflow: "hidden",
              boxShadow: "0 24px 50px -34px rgba(42,33,28,0.5)",
              ...rise(frame, 14 + i * 9, 50),
            }}
          >
            <Crop
              file={p.file}
              imageWidth={p.imageWidth}
              crop={p.crop}
              width={CARD_W}
              style={{ borderBottom: `1px solid ${C.line}`, background: C.bg }}
            />
            <div style={{ padding: "26px 28px 30px", display: "grid", gap: 8 }}>
              <div style={{ fontFamily: FONT, fontWeight: 800, fontSize: 38, color: C.ink, letterSpacing: "-0.01em" }}>
                {p.title}
              </div>
              <div style={{ fontFamily: FONT, fontWeight: 500, fontSize: 26, lineHeight: 1.3, color: C.ink2 }}>
                {p.line}
              </div>
            </div>
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
}
