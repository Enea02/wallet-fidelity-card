import { theme, themeVars } from "@loyalty/shared/theme";
import type { Metadata } from "next";
import "../interno/interno.css";

export const metadata: Metadata = {
  title: "Accesso · Loyalty Wallet",
  robots: { index: false, follow: false },
};

/** Login unico per il pannello interno e la web app esercente: stesso stile del pannello, tema neutro. */
export default function AccessoLayout({ children }: { children: React.ReactNode }) {
  const vars = themeVars(theme(null)) as React.CSSProperties;
  return (
    <div className="int int-plain" style={vars}>
      <main className="int-main">{children}</main>
    </div>
  );
}
