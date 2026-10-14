import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque } from "next/font/google";
import "./globals.css";

// font del design system (Bricolage Grotesque), servito dal nostro dominio da next/font
const bricolage = Bricolage_Grotesque({ subsets: ["latin"], display: "swap", variable: "--lw-font" });

export const metadata: Metadata = {
  title: "Carta fedeltà",
  description: "La carta fedeltà del negozio nel Wallet del telefono: niente app da scaricare.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it" className={bricolage.variable}>
      <body>{children}</body>
    </html>
  );
}
