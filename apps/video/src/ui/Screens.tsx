import type { CSSProperties, ReactNode } from "react";
import { Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import { C } from "./theme";

export interface Screen {
  /** nome del file in docs/tutorial/img, senza estensione */
  file: string;
  /** fotogramma (dall'inizio della scena) in cui la schermata entra */
  at: number;
}

const FADE = 10;

/**
 * Schermate reali una sopra l'altra: ognuna entra in dissolvenza al suo fotogramma `at`, con un lieve
 * scorrimento verso l'alto per dare il senso del passaggio da una schermata alla successiva.
 */
export function Slideshow({ screens, fit = "cover" }: { screens: Screen[]; fit?: "cover" | "contain" }) {
  const frame = useCurrentFrame();
  return (
    <div style={{ position: "absolute", inset: 0, background: C.surface }}>
      {screens.map((sc, i) => {
        const opacity =
          i === 0
            ? 1
            : interpolate(frame, [sc.at, sc.at + FADE], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              });
        const shift =
          i === 0
            ? 0
            : interpolate(frame, [sc.at, sc.at + FADE * 2], [24, 0], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              });
        return (
          <Img
            key={sc.file}
            src={staticFile(`screens/${sc.file}.png`)}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: fit,
              objectPosition: "top center",
              opacity,
              transform: `translateY(${shift}px)`,
            }}
          />
        );
      })}
    </div>
  );
}

/** Telefono: cornice scura arrotondata con lo schermo nelle proporzioni delle schermate. */
export function Phone({
  width,
  aspect,
  children,
  style,
}: {
  width: number;
  /** larghezza / altezza dello schermo */
  aspect: number;
  children: ReactNode;
  style?: CSSProperties;
}) {
  const bezel = Math.round(width * 0.035);
  const screenW = width - bezel * 2;
  return (
    <div
      style={{
        width,
        padding: bezel,
        borderRadius: width * 0.14,
        background: "#14100D",
        boxShadow: "0 40px 80px -30px rgba(42,33,28,0.55), inset 0 0 0 2px #3a302a",
        ...style,
      }}
    >
      <div
        style={{
          position: "relative",
          width: screenW,
          height: screenW / aspect,
          borderRadius: width * 0.11,
          overflow: "hidden",
        }}
      >
        {children}
      </div>
    </div>
  );
}

/** Finestra del browser, per le schermate da computer dell'area titolare. */
export function Browser({ width, children, style }: { width: number; children: ReactNode; style?: CSSProperties }) {
  const bar = 44;
  return (
    <div
      style={{
        width,
        borderRadius: 18,
        overflow: "hidden",
        background: C.surface,
        border: `1px solid ${C.line}`,
        boxShadow: "0 40px 90px -40px rgba(42,33,28,0.5)",
        ...style,
      }}
    >
      <div
        style={{
          height: bar,
          display: "flex",
          alignItems: "center",
          gap: 9,
          padding: "0 18px",
          background: "#EFE8DF",
          borderBottom: `1px solid ${C.line}`,
        }}
      >
        {["#D9CFC5", "#D9CFC5", "#D9CFC5"].map((c, i) => (
          <span key={i} style={{ width: 13, height: 13, borderRadius: 7, background: c }} />
        ))}
      </div>
      <div style={{ position: "relative", width, height: (width * 1200) / 1920 }}>{children}</div>
    </div>
  );
}

/**
 * Ritaglio di una schermata: mostra il rettangolo `crop` (in pixel dell'immagine) dentro un riquadro largo
 * `width`, per far leggere un dettaglio di una schermata grande.
 */
export function Crop({
  file,
  imageWidth,
  crop,
  width,
  style,
}: {
  file: string;
  imageWidth: number;
  crop: { x: number; y: number; w: number; h: number };
  width: number;
  style?: CSSProperties;
}) {
  const k = width / crop.w;
  return (
    <div style={{ position: "relative", width, height: crop.h * k, overflow: "hidden", ...style }}>
      <Img
        src={staticFile(`screens/${file}.png`)}
        style={{ position: "absolute", width: imageWidth * k, maxWidth: "none", left: -crop.x * k, top: -crop.y * k }}
      />
    </div>
  );
}
