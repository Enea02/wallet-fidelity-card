import type { Role } from "@loyalty/shared/api";

/*
 * Sezioni dell'app per ruolo (brief, Fase 6 punto 5): l'operatore vede solo scanner e profilo,
 * il titolare le sezioni del negozio (design Titolare T2) più scanner e profilo.
 * Il layout decide come mostrarle (tab su mobile, barra laterale da tablet orizzontale in su).
 */
export type SectionKey = "panoramica" | "clienti" | "carta" | "staff" | "messaggi" | "cartello" | "scanner" | "profilo";

export interface Section {
  key: SectionKey;
  label: string;
  /** Nelle tab su mobile (il profilo su mobile è l'avatar in alto). */
  inTabs: boolean;
}

const OWNER: Section[] = [
  { key: "panoramica", label: "Panoramica", inTabs: true },
  { key: "clienti", label: "Clienti", inTabs: true },
  { key: "carta", label: "Carta", inTabs: true },
  { key: "staff", label: "Staff", inTabs: true },
  { key: "messaggi", label: "Messaggi", inTabs: true },
  { key: "cartello", label: "Cartello", inTabs: false },
  { key: "scanner", label: "Scanner", inTabs: false },
  { key: "profilo", label: "Profilo", inTabs: false },
];

const OPERATOR: Section[] = [
  { key: "scanner", label: "Scanner", inTabs: true },
  { key: "profilo", label: "Profilo", inTabs: true },
];

export const sectionsFor = (role: Role): Section[] => (role === "owner" ? OWNER : OPERATOR);

export const homeFor = (role: Role): SectionKey => (role === "owner" ? "panoramica" : "scanner");

/** Sezione del percorso corrente (es. "/clienti" → "clienti"), null se non è una sezione. */
export function sectionOf(pathname: string): SectionKey | null {
  const first = pathname.split("/").filter(Boolean)[0] ?? "";
  return (OWNER.some((s) => s.key === first) ? first : null) as SectionKey | null;
}

export const canSee = (role: Role, key: SectionKey) => sectionsFor(role).some((s) => s.key === key);

/** Barra laterale da 900 px (tablet orizzontale e desktop), tab sotto. */
export const SIDEBAR_MIN_WIDTH = 900;
export const isWide = (width: number) => width >= SIDEBAR_MIN_WIDTH;
