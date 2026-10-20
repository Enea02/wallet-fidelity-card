import type { CSSProperties, ReactNode } from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { rise } from "./motion";
import { C, FONT } from "./theme";

export function Eyebrow({
  children,
  delay = 0,
  color = C.wine,
}: {
  children: ReactNode;
  delay?: number;
  color?: string;
}) {
  const frame = useCurrentFrame();
  return (
    <div
      style={{
        fontFamily: FONT,
        fontWeight: 700,
        fontSize: 26,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        color,
        ...rise(frame, delay, 20),
      }}
    >
      {children}
    </div>
  );
}

export function Title({
  children,
  delay = 4,
  size = 84,
  color = C.ink,
  style,
}: {
  children: ReactNode;
  delay?: number;
  size?: number;
  color?: string;
  style?: CSSProperties;
}) {
  const frame = useCurrentFrame();
  return (
    <h1
      style={{
        fontFamily: FONT,
        fontWeight: 800,
        fontSize: size,
        lineHeight: 1.04,
        letterSpacing: "-0.03em",
        color,
        margin: 0,
        textWrap: "balance",
        ...rise(frame, delay),
        ...style,
      }}
    >
      {children}
    </h1>
  );
}

export function Lead({
  children,
  delay = 10,
  color = C.ink2,
  size = 36,
}: {
  children: ReactNode;
  delay?: number;
  color?: string;
  size?: number;
}) {
  const frame = useCurrentFrame();
  return (
    <p
      style={{
        fontFamily: FONT,
        fontWeight: 500,
        fontSize: size,
        lineHeight: 1.3,
        color,
        margin: 0,
        ...rise(frame, delay),
      }}
    >
      {children}
    </p>
  );
}

/**
 * Passi numerati che si accendono uno alla volta: `at` è il fotogramma in cui il passo diventa quello attivo.
 * I passi già fatti restano visibili ma spenti, così si legge la sequenza intera.
 */
export function Steps({
  steps,
  numbered = true,
}: {
  steps: Array<{ text: ReactNode; at: number }>;
  numbered?: boolean;
}) {
  const frame = useCurrentFrame();
  return (
    <div style={{ display: "grid", gap: 26 }}>
      {steps.map((st, i) => {
        const next = steps[i + 1]?.at ?? Infinity;
        const active = frame >= st.at && frame < next;
        const seen = frame >= st.at;
        const glow = interpolate(frame, [st.at, st.at + 10], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        return (
          <div
            key={i}
            style={{
              display: "flex",
              gap: 24,
              alignItems: "flex-start",
              opacity: seen ? (active ? 1 : 0.42) : 0.18,
              transform: `translateX(${active ? glow * 8 : 0}px)`,
            }}
          >
            <div
              style={{
                flex: "0 0 auto",
                width: 58,
                height: 58,
                borderRadius: 29,
                display: "grid",
                placeItems: "center",
                fontFamily: FONT,
                fontWeight: 800,
                fontSize: 28,
                color: active ? C.surface : C.wine,
                background: active ? C.wine : C.wineSoft,
              }}
            >
              {numbered ? i + 1 : "✓"}
            </div>
            <div
              style={{ fontFamily: FONT, fontWeight: 600, fontSize: 38, lineHeight: 1.22, color: C.ink, paddingTop: 6 }}
            >
              {st.text}
            </div>
          </div>
        );
      })}
    </div>
  );
}
