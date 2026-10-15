import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Platform, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CameraScanner } from "@/features/scan/CameraScanner";
import { ManualEntry } from "@/features/scan/ManualEntry";
import { ReaderInput } from "@/features/scan/ReaderInput";
import { useScan } from "@/features/scan/useScan";
import { useScanMode } from "@/features/scan/useScanMode";
import { useSound } from "@/features/scan/useSound";
import { useOnline } from "@/lib/network";
import { Banner } from "@/ui/Banner";
import { Button } from "@/ui/Button";
import { Icon } from "@/ui/Icon";
import { Segmented } from "@/ui/Segmented";
import { SupportCode } from "@/ui/SupportCode";
import { T } from "@/ui/Text";
import { radius, space, useTheme } from "@/ui/theme";

/**
 * Scanner (design Staff P): fotocamera, lettore QR esterno o codice breve a mano.
 * Una lettura valida apre la scheda cliente; gli errori restano qui, leggibili a un metro.
 */
export default function Scanner() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const online = useOnline();
  const [mode, setMode] = useScanMode();
  const [sound, toggleSound] = useSound();
  const { handle, busy, notice, dismiss } = useScan(mode, sound);
  const [focused, setFocused] = useState(true);

  // fotocamera e campo del lettore attivi solo con la schermata in primo piano
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  // con un avviso aperto la fotocamera si ferma: un QR sbagliato ancora inquadrato non viene riletto
  const active = focused && !busy && online && notice === null;

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <View
        style={{
          paddingTop: insets.top + space.md,
          paddingHorizontal: space.lg,
          paddingBottom: space.md,
          gap: space.md,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
          <T variant="title" accessibilityRole="header" style={{ flex: 1 }}>
            Scanner
          </T>
          {Platform.OS === "web" ? (
            <Pressable
              accessibilityRole="switch"
              accessibilityState={{ checked: sound }}
              accessibilityLabel="Suono di conferma"
              testID="interruttore-suono"
              onPress={toggleSound}
              style={{
                width: 44,
                height: 44,
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 22,
                backgroundColor: t.surface2,
              }}
            >
              <Icon name={sound ? "sound" : "mute"} color={sound ? t.accentText : t.ink2} size={22} />
            </Pressable>
          ) : null}
        </View>
        <Segmented
          value={mode}
          onChange={setMode}
          testID="modalita-scanner"
          options={[
            { key: "fotocamera", label: "Fotocamera", icon: "camera" },
            { key: "lettore", label: "Lettore", icon: "keyboard" },
            { key: "manuale", label: "Codice", icon: "edit" },
          ]}
        />
      </View>

      <View style={{ flex: 1, marginHorizontal: mode === "fotocamera" ? 0 : space.lg, overflow: "hidden" }}>
        {mode === "fotocamera" ? (
          <CameraScanner active={active} onCode={(raw) => void handle(raw)} />
        ) : mode === "lettore" ? (
          <ReaderInput active={active} onCode={(raw) => void handle(raw)} />
        ) : (
          <ManualEntry busy={busy} onCode={(raw) => void handle(raw)} />
        )}
        {busy ? (
          <View
            style={{ position: "absolute", left: 0, right: 0, bottom: space.xl, alignItems: "center" }}
            accessibilityLiveRegion="polite"
          >
            <View
              style={{
                flexDirection: "row",
                gap: space.sm,
                backgroundColor: t.surface,
                borderRadius: radius.pill,
                paddingHorizontal: space.lg,
                paddingVertical: space.sm,
              }}
            >
              <ActivityIndicator color={t.accentText} />
              <T>Cerco la carta…</T>
            </View>
          </View>
        ) : null}
      </View>

      {notice ? (
        <View
          style={{ position: "absolute", left: space.lg, right: space.lg, bottom: space.lg }}
          testID="avviso-scanner"
        >
          <Banner tone="danger" title={notice.title}>
            <T variant="small">{notice.userMessage}</T>
            {notice.supportCode ? <SupportCode code={notice.supportCode} /> : null}
            <Button
              label="Ok, riprova"
              variant="secondary"
              onPress={dismiss}
              style={{ marginTop: space.sm }}
              testID="chiudi-avviso"
            />
          </Banner>
        </View>
      ) : null}
    </View>
  );
}
