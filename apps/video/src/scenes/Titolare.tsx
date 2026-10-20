import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { rise } from "../ui/motion";
import { Browser, Slideshow } from "../ui/Screens";
import { Eyebrow, Title } from "../ui/Text";
import { C, FONT } from "../ui/theme";

const SCREENS = [
  {
    file: "titolare-01-panoramica",
    at: 0,
    caption: "Ogni settimana: nuovi iscritti, timbri, premi e chi non torna da due mesi",
  },
  {
    file: "titolare-02-clienti",
    at: 120,
    caption: "Tutti i clienti con saldo e storico, il telefono sempre mascherato",
  },
  { file: "titolare-08-carta", at: 240, caption: "Colore, logo e premio della carta li decidi tu, con l'anteprima" },
  {
    file: "titolare-10-messaggi",
    at: 360,
    caption: "Un messaggio a settimana, come notifica sulla carta di chi l'ha accettato",
  },
];

/** L'area titolare su computer: quattro schermate con la loro didascalia, che cambia insieme alla schermata. */
export function Titolare() {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill
      style={{ background: C.bg, flexDirection: "row", alignItems: "center", padding: "0 110px 0 140px", gap: 70 }}
    >
      <div style={{ width: 560, display: "grid", gap: 40 }}>
        <div style={{ display: "grid", gap: 22 }}>
          <Eyebrow>Per te, titolare</Eyebrow>
          <Title size={68}>Il tuo negozio sotto controllo.</Title>
        </div>
        <div style={{ position: "relative", height: 260 }}>
          {SCREENS.map((sc, i) => {
            const end = SCREENS[i + 1]?.at ?? 10_000; // l'ultima didascalia resta fino alla fine
            const opacity = interpolate(frame, [sc.at, sc.at + 12, end - 8, end], [i === 0 ? 1 : 0, 1, 1, 0], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });
            return (
              <div
                key={sc.file}
                style={{
                  position: "absolute",
                  inset: 0,
                  opacity,
                  fontFamily: FONT,
                  fontWeight: 600,
                  fontSize: 40,
                  lineHeight: 1.25,
                  color: C.ink,
                  borderLeft: `6px solid ${C.wine}`,
                  paddingLeft: 26,
                }}
              >
                {sc.caption}
              </div>
            );
          })}
        </div>
        <div style={{ fontFamily: FONT, fontSize: 26, color: C.ink2, ...rise(frame, 20, 10) }}>
          La stessa app su iPhone, Android e computer.
        </div>
      </div>
      <div style={rise(frame, 6, 60)}>
        <Browser width={1060}>
          <Slideshow screens={SCREENS} />
        </Browser>
      </div>
    </AbsoluteFill>
  );
}
