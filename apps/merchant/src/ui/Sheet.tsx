import type { ReactNode } from "react";
import { Modal, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { radius, space, useTheme } from "./theme";

/** Foglio dal basso con sfondo scurito (avvisi e conferme del design Staff). */
export function Sheet({
  visible,
  onClose,
  children,
  testID,
}: {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  testID?: string;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, justifyContent: "flex-end" }}>
        <Pressable
          accessibilityLabel="Chiudi"
          onPress={onClose}
          style={{ position: "absolute", inset: 0, backgroundColor: "rgba(30,20,12,0.45)" }}
        />
        <View
          {...(testID !== undefined && { testID })}
          accessibilityViewIsModal
          style={{
            backgroundColor: t.surface,
            borderTopLeftRadius: radius.card + 4,
            borderTopRightRadius: radius.card + 4,
            padding: space.xl,
            paddingBottom: insets.bottom + space.xl,
            gap: space.md,
            width: "100%",
            maxWidth: 560,
            alignSelf: "center",
          }}
        >
          {children}
        </View>
      </View>
    </Modal>
  );
}
