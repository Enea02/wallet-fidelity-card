import * as Haptics from "expo-haptics";
import { Platform, Vibration } from "react-native";

/*
 * Feedback fisico (design 05 · Movimento): timbro → vibrazione breve (20 ms);
 * premio sbloccato → 30-60-30. Su iOS si usa il motore aptico, su Android la vibrazione.
 * Sul web niente: feedback visivo e, se attivato, sonoro (feedback.web.ts).
 */
export function feedback(kind: "stamp" | "reward" | "error", _sound = false) {
  if (Platform.OS === "android") {
    Vibration.vibrate(kind === "reward" ? [0, 30, 60, 30] : kind === "error" ? [0, 40, 40, 40] : 20);
    return;
  }
  if (kind === "reward") void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  else if (kind === "error") void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  else void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}
