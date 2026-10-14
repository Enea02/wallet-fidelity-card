import { themeCss } from "@/lib/public/theme-style";

/** Timbro "perso" del design (C2): cerchio tratteggiato con un numero. */
function LostStamp() {
  return (
    <svg className="mark" viewBox="0 0 88 88" aria-hidden="true">
      <circle cx="44" cy="44" r="40" fill="none" stroke="var(--lw-ink-3)" strokeWidth="3" strokeDasharray="8 6" />
      <text x="44" y="44" dy=".35em" textAnchor="middle" fontSize="30" fontWeight="600" fill="var(--lw-ink-3)">
        1
      </text>
    </svg>
  );
}

/**
 * Pagina di stato con tema neutro (accento = inchiostro): negozio inesistente o sospeso,
 * link non valido, disiscrizione completata.
 */
export function StatusScreen({
  title,
  children,
  brand,
}: {
  title: string;
  children: React.ReactNode;
  brand?: string | null;
}) {
  return (
    <main className="lw-page">
      <style dangerouslySetInnerHTML={{ __html: themeCss(brand) }} />
      <div className="lw-status">
        <LostStamp />
        <h1 className="lw-title">{title}</h1>
        {children}
      </div>
    </main>
  );
}
