import { theme, themeVars } from "@loyalty/shared/theme";
import type { Metadata } from "next";
import Link from "next/link";
import { checkSupportSession } from "@/lib/support/session";
import { logoutAction } from "./actions";
import "./interno.css";

export const metadata: Metadata = {
  title: "Pannello interno · Loyalty Wallet",
  robots: { index: false, follow: false },
};

/** Pannello interno: solo il nostro team (support_members) con 2FA. Il menu compare a sessione valida. */
export default async function InternalLayout({ children }: { children: React.ReactNode }) {
  const session = await checkSupportSession();
  return (
    <div className="int" style={themeVars(theme(null)) as React.CSSProperties}>
      <header className="int-top">
        <Link href="/interno" className="int-brand">
          Loyalty Wallet · interno
        </Link>
        {session.ok && (
          <nav className="int-nav" aria-label="Pannello interno">
            <Link href="/interno">Assistenza</Link>
            <Link href="/interno/negozi">Negozi</Link>
            <Link href="/interno/diagnostica">Diagnostica</Link>
            <form action={logoutAction}>
              <button type="submit" className="int-btn int-ghost" data-testid="esci">
                Esci ({session.user.name})
              </button>
            </form>
          </nav>
        )}
      </header>
      <main className="int-main">{children}</main>
    </div>
  );
}
