import type { Href } from "expo-router";
import type { SectionKey } from "@/lib/navigation/sections";
import type { IconName } from "../Icon";

export const ICON: Record<SectionKey, IconName> = {
  panoramica: "home",
  clienti: "users",
  carta: "card",
  staff: "staff",
  messaggi: "message",
  scanner: "scan",
  profilo: "profile",
};

/** Etichetta corta nelle tab su mobile (design T2 mobile: "Home"). */
export const TAB_LABEL: Partial<Record<SectionKey, string>> = { panoramica: "Home" };

export const hrefOf = (key: SectionKey) => `/${key}` as Href;
