import { theme, themeVars } from "@loyalty/shared/theme";
import type { Metadata } from "next";
import Link from "next/link";
import { initials } from "@/lib/support/overview-view";
import { navCounts } from "@/lib/support/overview";
import { checkSupportSession } from "@/lib/support/session";
import { logoutAction } from "./actions";
import { Icon } from "./_ui/icons";
import { SideNav } from "./_ui/SideNav";
import "./interno.css";

export const metadata: Metadata = {
  title: "Pannello interno · Loyalty Wallet",
  robots: { index: false, follow: false },
};

/** Pannello interno: solo il nostro team (support_members) con 2FA. La barra laterale compare a sessione valida. */
export default async function InternalLayout({ children }: { children: React.ReactNode }) {
  const session = await checkSupportSession();
  const vars = themeVars(theme(null)) as React.CSSProperties;
  if (!session.ok) {
    return (
      <div className="int int-plain" style={vars}>
        <main className="int-main">{children}</main>
      </div>
    );
  }
  const counts = await navCounts();
  return (
    <div className="int int-app" style={vars}>
      <aside className="int-side">
        <Link href="/interno" className="int-side-brand">
          <span className="int-logo" aria-hidden="true">
            LW
          </span>
          <span>
            <strong>Loyalty Wallet</strong>
            <small>pannello interno</small>
          </span>
        </Link>
        <SideNav problemShops={counts.problemShops} tickets={counts.tickets} />
        <div className="int-side-user">
          <span className="int-avatar" aria-hidden="true">
            {initials(session.user.name)}
          </span>
          <div>
            <span>{session.user.name}</span>
            <small>team · 2FA attiva</small>
          </div>
          <form action={logoutAction}>
            <button type="submit" className="int-icon-btn" aria-label="Esci" title="Esci" data-testid="esci">
              <Icon name="logout" />
            </button>
          </form>
        </div>
      </aside>
      <main className="int-main">{children}</main>
    </div>
  );
}
