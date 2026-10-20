import { AbsoluteFill, useCurrentFrame } from "remotion";
import { rise } from "../ui/motion";
import { Gift } from "../ui/StampCard";
import { C, FONT } from "../ui/theme";

/** Chiusura: il nome, la promessa e il passo successivo. */
export function Chiusura() {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: C.wine, justifyContent: "center", padding: "0 160px", gap: 34 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 28, ...rise(frame, 0) }}>
        <div
          style={{ width: 104, height: 104, borderRadius: 52, background: C.bg, display: "grid", placeItems: "center" }}
        >
          <Gift size={58} color={C.wine} />
        </div>
        <div style={{ fontFamily: FONT, fontWeight: 800, fontSize: 112, color: C.bg, letterSpacing: "-0.035em" }}>
          Loyalty Wallet
        </div>
      </div>
      <div
        style={{ fontFamily: FONT, fontWeight: 600, fontSize: 56, color: C.bg, lineHeight: 1.15, ...rise(frame, 10) }}
      >
        Più clienti che tornano. Nessuna app da scaricare.
      </div>
      <div
        style={{
          alignSelf: "flex-start",
          marginTop: 24,
          padding: "22px 40px",
          borderRadius: 999,
          background: C.bg,
          color: C.wine,
          fontFamily: FONT,
          fontWeight: 700,
          fontSize: 40,
          ...rise(frame, 24),
        }}
      >
        Chiedici una demo con la carta del tuo negozio
      </div>
    </AbsoluteFill>
  );
}
