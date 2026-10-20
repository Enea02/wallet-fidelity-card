import { AbsoluteFill, useCurrentFrame } from "remotion";
import { rise } from "../ui/motion";
import { Phone, Slideshow } from "../ui/Screens";
import { Eyebrow, Steps, Title } from "../ui/Text";
import { C } from "../ui/theme";

// schermate da iPhone (390 × 664 punti di pagina)
const IPHONE = 780 / 1328;

/** Lo scanner dell'operatore: lettura, timbro, protezione dai doppi timbri, premio. */
export function Cassa() {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill
      style={{ background: C.bg, flexDirection: "row", alignItems: "center", padding: "0 140px", gap: 110 }}
    >
      <div style={rise(frame, 6, 60)}>
        <Phone width={560} aspect={IPHONE}>
          <Slideshow
            screens={[
              { file: "cassa-01-scanner-lettore", at: 0 },
              { file: "cassa-03-scheda-cliente", at: 90 },
              { file: "cassa-04-timbro-dato", at: 165 },
              { file: "cassa-07-carta-quasi-completa", at: 270 },
              { file: "cassa-08-premio-sbloccato", at: 330 },
            ]}
          />
        </Phone>
      </div>
      <div style={{ flex: 1, display: "grid", gap: 44 }}>
        <div style={{ display: "grid", gap: 22 }}>
          <Eyebrow>In cassa</Eyebrow>
          <Title size={78}>Un tocco e il timbro è dato.</Title>
        </div>
        <Steps
          numbered={false}
          steps={[
            { text: "Fotocamera, lettore QR o codice scritto a mano", at: 0 },
            { text: "+1 timbro in meno di 2 secondi, e la carta nel Wallet si aggiorna", at: 90 },
            { text: "Niente doppi timbri per errore; annulli entro 5 minuti", at: 165 },
            { text: "Al decimo timbro il premio si sblocca e si riscatta con un tocco", at: 270 },
          ]}
        />
      </div>
    </AbsoluteFill>
  );
}
