"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "./icons";

interface Item {
  href: string;
  label: string;
  icon: IconName;
  count?: number;
  alert?: boolean;
  testId?: string;
}

/** Voci della barra laterale; la pagina corrente è quella col prefisso più lungo (la Panoramica solo esatta). */
export function SideNav({ problemShops, tickets }: { problemShops: number; tickets: number }) {
  const path = usePathname();
  const main: Item[] = [
    { href: "/interno", label: "Panoramica", icon: "grid", testId: "nav-panoramica" },
    { href: "/interno/assistenza", label: "Assistenza", icon: "search", testId: "nav-assistenza" },
    { href: "/interno/negozi", label: "Negozi", icon: "shop", count: problemShops, alert: true, testId: "nav-negozi" },
    { href: "/interno/diagnostica", label: "Diagnostica", icon: "pulse", count: tickets, testId: "nav-diagnostica" },
  ];
  const shortcuts: Item[] = [
    { href: "/interno/negozi/nuovo", label: "Nuovo negozio", icon: "plus" },
    { href: "/interno/negozi?stato=problemi", label: "Negozi con problemi", icon: "sync" },
  ];
  const current = (href: string) =>
    href === "/interno"
      ? path === "/interno"
      : href === "/interno/negozi"
        ? path.startsWith(href) && path !== "/interno/negozi/nuovo"
        : path === href || path.startsWith(`${href}/`);

  const link = (i: Item) => (
    <Link
      key={i.href}
      href={i.href}
      aria-current={current(i.href.split("?")[0]!) ? "page" : undefined}
      data-testid={i.testId}
    >
      <Icon name={i.icon} />
      {i.label}
      {i.count ? (
        <span className={i.alert ? "int-count int-count-err" : "int-count"} aria-label={`${i.count} da guardare`}>
          {i.count}
        </span>
      ) : null}
    </Link>
  );

  return (
    <>
      <nav className="int-side-nav" aria-label="Pannello interno">
        {main.map(link)}
      </nav>
      <div className="int-side-extra">
        <div className="int-side-label">Scorciatoie</div>
        <nav className="int-side-nav" aria-label="Scorciatoie">
          {shortcuts.map(link)}
        </nav>
      </div>
    </>
  );
}
