import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { rise } from "../ui/motion";
import { C, FONT } from "../ui/theme";

const LINES = [
  { text: "Le tessere di carta si perdono.", at: 0, strike: 34 },
  { text: "Le app del negozio non le scarica nessuno.", at: 40, strike: 74 },
];

/** Le due alternative di oggi vengono barrate; resta il Wallet, che i clienti hanno già. */
export function Problema() {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: C.wine, justifyContent: "center", padding: "0 160px", gap: 36 }}>
      {LINES.map((l) => {
        const w = interpolate(frame, [l.strike, l.strike + 12], [0, 100], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        return (
          <div key={l.text} style={{ position: "relative", alignSelf: "flex-start", ...rise(frame, l.at) }}>
            <span
              style={{
                fontFamily: FONT,
                fontWeight: 700,
                fontSize: 70,
                color: "rgba(246,242,236,0.72)",
                letterSpacing: "-0.02em",
              }}
            >
              {l.text}
            </span>
            <span
              style={{
                position: "absolute",
                left: 0,
                top: "54%",
                height: 6,
                width: `${w}%`,
                background: C.bg,
                borderRadius: 3,
              }}
            />
          </div>
        );
      })}
      <div
        style={{
          ...rise(frame, 88),
          fontFamily: FONT,
          fontWeight: 800,
          fontSize: 96,
          color: C.bg,
          letterSpacing: "-0.03em",
          lineHeight: 1.05,
          marginTop: 20,
        }}
      >
        Il Wallet, invece, ce l&apos;hanno già tutti.
      </div>
    </AbsoluteFill>
  );
}
