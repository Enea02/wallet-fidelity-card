import { AbsoluteFill, useCurrentFrame } from "remotion";
import { rise } from "../ui/motion";
import { Phone, Slideshow } from "../ui/Screens";
import { Eyebrow, Lead, Title } from "../ui/Text";
import { C } from "../ui/theme";

/** "Invia diagnostica": l'esercente comunica un codice e l'assistenza vede cosa è successo. */
export function Assistenza() {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill
      style={{ background: C.bg, flexDirection: "row", alignItems: "center", padding: "0 140px", gap: 110 }}
    >
      <div style={{ flex: 1, display: "grid", gap: 34 }}>
        <Eyebrow>Assistenza</Eyebrow>
        <Title size={76}>Se qualcosa non va, ti basta un codice.</Title>
        <Lead delay={14}>
          Ogni errore mostra un codice di assistenza. Ce lo detti e vediamo subito cosa è successo, senza chiederti
          altro.
        </Lead>
      </div>
      <div style={rise(frame, 6, 60)}>
        <Phone width={470} aspect={780 / 1328}>
          <Slideshow screens={[{ file: "cassa-14-diagnostica-inviata", at: 0 }]} />
        </Phone>
      </div>
    </AbsoluteFill>
  );
}
