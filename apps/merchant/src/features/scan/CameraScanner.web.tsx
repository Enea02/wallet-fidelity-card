import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { log } from "@/lib/diagnostics/logger";
import { Icon } from "@/ui/Icon";
import { T } from "@/ui/Text";
import { space, useTheme } from "@/ui/theme";
import type { CameraScannerProps } from "./types";
import { Viewfinder } from "./Viewfinder";

/*
 * Scanner del browser: webcam o fotocamera del tablet con getUserMedia, decodifica con
 * BarcodeDetector del browser (Chrome su Android e macOS) oppure con il polyfill ZXing in
 * WebAssembly (Safari, Firefox, Chrome su Windows), caricato solo quando serve e servito da noi.
 */

interface Detector {
  detect(source: HTMLVideoElement): Promise<Array<{ rawValue: string }>>;
}

async function makeDetector(): Promise<Detector> {
  const Native = (
    globalThis as { BarcodeDetector?: { new (o: object): Detector; getSupportedFormats(): Promise<string[]> } }
  ).BarcodeDetector;
  if (Native && (await Native.getSupportedFormats().catch((): string[] => [])).includes("qr_code")) {
    return new Native({ formats: ["qr_code"] });
  }
  const { BarcodeDetector, prepareZXingModule } = await import("barcode-detector/ponyfill");
  prepareZXingModule({
    overrides: {
      locateFile: (path: string, prefix: string) => (path.endsWith(".wasm") ? `/zxing/${path}` : prefix + path),
    },
  });
  return new BarcodeDetector({ formats: ["qr_code"] });
}

type Phase = "starting" | "running" | "denied" | "unavailable";

export function CameraScanner({ active, onCode }: CameraScannerProps) {
  const t = useTheme();
  const video = useRef<HTMLVideoElement | null>(null);
  const track = useRef<MediaStreamTrack | null>(null);
  const [phase, setPhase] = useState<Phase>("starting");
  const [torch, setTorch] = useState<boolean | null>(null);
  const onCodeRef = useRef(onCode);
  onCodeRef.current = onCode;

  useEffect(() => {
    if (!active) return;
    let stopped = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    let stream: MediaStream | null = null;

    void (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setPhase("unavailable");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      } catch (e) {
        const denied = e instanceof DOMException && (e.name === "NotAllowedError" || e.name === "SecurityError");
        if (denied) log.event("scan.camera.denied", { can_ask_again: true });
        setPhase(denied ? "denied" : "unavailable");
        return;
      }
      if (stopped || !video.current) {
        stream.getTracks().forEach((tr) => tr.stop());
        return;
      }
      video.current.srcObject = stream;
      await video.current.play().catch(() => undefined);
      track.current = stream.getVideoTracks()[0] ?? null;
      const caps = (track.current?.getCapabilities?.() ?? {}) as { torch?: boolean };
      setTorch(caps.torch ? false : null);
      setPhase("running");

      const detector = await makeDetector();
      let busy = false;
      timer = setInterval(() => {
        const v = video.current;
        if (busy || !v || v.readyState < 2) return;
        busy = true;
        detector
          .detect(v)
          .then((codes) => {
            const raw = codes[0]?.rawValue;
            if (raw && !stopped) onCodeRef.current(raw);
          })
          .catch(() => undefined)
          .finally(() => {
            busy = false;
          });
      }, 150);
    })();

    return () => {
      stopped = true;
      if (timer) clearInterval(timer);
      stream?.getTracks().forEach((tr) => tr.stop());
      track.current = null;
    };
  }, [active]);

  async function toggleTorch() {
    if (torch === null || !track.current) return;
    const next = !torch;
    await track.current
      .applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] })
      .catch(() => undefined);
    setTorch(next);
  }

  if (phase === "denied" || phase === "unavailable") {
    return (
      <View
        style={[styles.center, { padding: space.xl, gap: space.md, backgroundColor: t.bg }]}
        testID="fotocamera-non-disponibile"
      >
        <T variant="subtitle" center>
          {phase === "denied" ? "Fotocamera non consentita" : "Nessuna fotocamera disponibile"}
        </T>
        <T tone="ink2" center>
          {phase === "denied"
            ? "Consenti la fotocamera dall'icona accanto all'indirizzo del browser, oppure usa il lettore esterno o il codice breve."
            : "Usa il lettore QR esterno o scrivi il codice breve."}
        </T>
      </View>
    );
  }

  return (
    <View style={styles.fill}>
      <video
        ref={video}
        muted
        playsInline
        data-testid="video-fotocamera"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
      />
      {phase === "starting" ? (
        <View style={styles.center}>
          <ActivityIndicator color="#FFFFFF" />
        </View>
      ) : (
        <Viewfinder />
      )}
      {torch !== null ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={torch ? "Spegni la torcia" : "Accendi la torcia"}
          onPress={() => void toggleTorch()}
          style={[styles.torch, { backgroundColor: torch ? t.bg : "rgba(0,0,0,0.45)" }]}
        >
          <Icon name="torch" color={torch ? t.ink : "#FFFFFF"} size={24} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: "#000", overflow: "hidden" },
  center: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center" },
  torch: {
    position: "absolute",
    right: space.lg,
    top: space.lg,
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
  },
});
