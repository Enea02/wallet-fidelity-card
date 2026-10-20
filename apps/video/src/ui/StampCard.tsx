import { interpolate, spring, useCurrentFrame } from "remotion";
import { FONT, FPS } from "./theme";

/**
 * La carta a timbri disegnata come sul web pubblico: 9 caselle e il premio. I timbri si riempiono uno
 * dopo l'altro a partire dal fotogramma `start`, uno ogni `every` fotogrammi; al decimo si accende il premio.
 */
export function StampCard({
  width,
  color,
  shop,
  start,
  every = 6,
  stamps = 10,
}: {
  width: number;
  color: string;
  shop: string;
  start: number;
  every?: number;
  stamps?: number;
}) {
  const frame = useCurrentFrame();
  const filled = Math.max(0, Math.min(stamps, Math.floor((frame - start) / every) + 1));
  const prize = spring({ frame: frame - (start + every * 9), fps: FPS, config: { damping: 12 } });
  const cell = width * 0.12;
  return (
    <div
      style={{
        width,
        padding: width * 0.065,
        borderRadius: width * 0.07,
        background: color,
        color: "#fff",
        fontFamily: FONT,
        boxShadow: "0 40px 70px -30px rgba(40,20,60,0.55)",
      }}
    >
      <div
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: width * 0.06 }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: width * 0.03 }}>
          <div
            style={{
              width: width * 0.11,
              height: width * 0.11,
              borderRadius: "50%",
              background: "#fff",
              color,
              display: "grid",
              placeItems: "center",
              fontWeight: 800,
              fontSize: width * 0.05,
            }}
          >
            D
          </div>
          <span style={{ fontWeight: 700, fontSize: width * 0.055 }}>{shop}</span>
        </div>
        <span style={{ fontWeight: 700, fontSize: width * 0.05, fontVariantNumeric: "tabular-nums" }}>
          {Math.min(filled, 10)} / 10
        </span>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(5, 1fr)",
          rowGap: width * 0.035,
          justifyItems: "center",
        }}
      >
        {Array.from({ length: 10 }, (_, i) => {
          const isPrize = i === 9;
          const on = i < filled;
          const pop = spring({ frame: frame - (start + every * i), fps: FPS, config: { damping: 11, stiffness: 180 } });
          const scale = on ? interpolate(pop, [0, 1], [0.4, 1]) : 1;
          if (isPrize) {
            return (
              <div
                key={i}
                style={{
                  width: cell,
                  height: cell,
                  borderRadius: "50%",
                  display: "grid",
                  placeItems: "center",
                  border: on ? "none" : "2px dashed rgba(255,255,255,0.7)",
                  background: on ? "#fff" : "transparent",
                  transform: `scale(${on ? interpolate(prize, [0, 1], [0.5, 1.15]) : 1})`,
                }}
              >
                <Gift size={cell * 0.5} color={on ? color : "#fff"} />
              </div>
            );
          }
          return (
            <div
              key={i}
              style={{
                width: cell,
                height: cell,
                borderRadius: "50%",
                display: "grid",
                placeItems: "center",
                border: on ? "none" : "2px dashed rgba(255,255,255,0.65)",
                background: on ? "#fff" : "transparent",
                color: on ? color : "rgba(255,255,255,0.75)",
                fontWeight: 700,
                fontSize: cell * 0.36,
                transform: `scale(${scale})`,
              }}
            >
              {on ? <Scissors size={cell * 0.52} color={color} /> : i + 1}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Scissors({ size, color }: { size: number; color: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
    >
      <circle cx="6" cy="6" r="3" fill="none" />
      <circle cx="6" cy="18" r="3" fill="none" />
      <path d="M20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12" />
    </svg>
  );
}

export function Gift({ size, color }: { size: number; color: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="8" width="18" height="4" rx="1" fill="none" />
      <path d="M12 8v13M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7" />
      <path d="M7.5 8a2.5 2.5 0 0 1 0-5C10 3 12 8 12 8s2-5 4.5-5a2.5 2.5 0 0 1 0 5" />
    </svg>
  );
}
