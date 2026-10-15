import { Platform } from "react-native";
import type { Role } from "@loyalty/shared/api";
import { canSee, sectionOf } from "./sections";

/*
 * Web: l'indirizzo aperto all'avvio (segnalibro, pagina ricaricata) va ripreso appena la
 * sessione è pronta, invece di finire sempre sulla schermata iniziale del ruolo.
 */
let initial: string | null =
  Platform.OS === "web" && typeof window !== "undefined"
    ? `${window.location.pathname}${window.location.search}`
    : null;

/** L'indirizzo iniziale, una volta sola, se è una sezione che il ruolo può vedere. */
export function takeInitialPath(role: Role): string | null {
  const path = initial;
  initial = null;
  if (!path) return null;
  const section = sectionOf(path.split("?")[0] ?? "");
  return section && canSee(role, section) ? path : null;
}
