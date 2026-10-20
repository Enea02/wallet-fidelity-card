import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { rise } from "../ui/motion";
import { StampCard } from "../ui/StampCard";
import { Eyebrow, Lead, Title } from "../ui/Text";
import { C } from "../ui/theme";

/** La carta si riempie timbro dopo timbro fino al premio, accanto alla promessa del prodotto. */
export function Apertura() {
  const frame = useCurrentFrame();
  const tilt = interpolate(frame, [0, 160], [-7, -3]);
  return (
    <AbsoluteFill
      style={{ background: C.bg, flexDirection: "row", alignItems: "center", padding: "0 140px", gap: 100 }}
    >
      <div style={{ flex: 1, display: "grid", gap: 34 }}>
        <Eyebrow>Loyalty Wallet</Eyebrow>
        <Title size={92}>La carta fedeltà che i tuoi clienti hanno sempre in tasca.</Title>
        <Lead delay={18}>Sta nel Wallet del telefono. Nessuna app da scaricare, nessuna tessera da perdere.</Lead>
      </div>
      <div style={{ ...rise(frame, 6, 80), transform: `${rise(frame, 6, 80).transform} rotate(${tilt}deg)` }}>
        <StampCard width={640} color={C.shop} shop="Salone Demo" start={24} every={8} />
      </div>
    </AbsoluteFill>
  );
}
