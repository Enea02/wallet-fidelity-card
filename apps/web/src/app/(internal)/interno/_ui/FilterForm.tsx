"use client";

import type { ReactNode } from "react";

/** Modulo di filtri in GET: cambiare un menu a tendina lo invia subito, il testo si invia con Invio. */
export function FilterForm({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <form
      className={className}
      role="search"
      onChange={(e) => {
        if ((e.target as HTMLElement).tagName === "SELECT") e.currentTarget.requestSubmit();
      }}
    >
      {children}
    </form>
  );
}
