import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { optionalEnv } from "@/lib/env";
import { getShopBySlug } from "@/lib/loyalty";
import { themeCss } from "@/lib/public/theme-style";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Informativa privacy" };

/** Valore o segnaposto evidenziato, da completare (dati del titolare o del responsabile mancanti). */
function V({ value, label }: { value: string | null | undefined; label: string }) {
  return value ? <>{value}</> : <span className="lw-placeholder">[{label} da completare]</span>;
}

/**
 * Informativa ai sensi degli artt. 13–14 GDPR, generata dai dati del negozio (titolare) e del
 * responsabile del trattamento (PROCESSOR_*). TESTO DA FAR RIVEDERE A UN LEGALE prima del pilota.
 */
export default async function Privacy({ params }: { params: Promise<{ shop: string }> }) {
  const shop = await getShopBySlug((await params).shop);
  if (!shop) notFound();

  const holder = shop.legal_name ?? shop.name;
  const processor = {
    name: optionalEnv("PROCESSOR_NAME"),
    address: optionalEnv("PROCESSOR_ADDRESS"),
    vat: optionalEnv("PROCESSOR_VAT"),
    email: optionalEnv("PROCESSOR_EMAIL"),
  };
  const { vat_number: vat, privacy_email: email } = shop;

  return (
    <main className="lw-page">
      <style dangerouslySetInnerHTML={{ __html: themeCss(shop.hex_color) }} />
      <article className="lw-prose">
        <p>
          <a href={`/${shop.slug}`}>← Torna all&apos;iscrizione</a>
        </p>
        <h1>Informativa privacy · {shop.program_name}</h1>
        <p>
          Questa informativa spiega come vengono trattati i tuoi dati per la carta fedeltà digitale di{" "}
          <strong>{shop.name}</strong>.
        </p>

        <h2>Chi tratta i tuoi dati</h2>
        <p>
          <strong>Titolare del trattamento</strong>: {holder}
          {vat ? `, P.IVA ${vat}` : ""}. Contatto privacy: <V value={email} label="email privacy del negozio" />.
        </p>
        <p>
          <strong>Responsabile del trattamento</strong> (fornitore del servizio della carta digitale):{" "}
          <V value={processor.name} label="ragione sociale" />, <V value={processor.address} label="sede" />, P.IVA{" "}
          <V value={processor.vat} label="partita IVA" />, contatto <V value={processor.email} label="email privacy" />.
        </p>

        <h2>Quali dati</h2>
        <p>
          Nome, numero di cellulare, i timbri e i premi della tua carta con data e ora, i consensi che hai dato. Il
          numero serve a verificare che sia tuo (codice via SMS) e a ritrovare la tua carta se ti iscrivi di nuovo.
        </p>

        <h2>Perché e su quale base</h2>
        <ul>
          <li>
            Gestire la carta fedeltà (timbri, premi, aggiornamento nel Wallet): esecuzione del servizio che hai chiesto
            (art. 6.1.b GDPR).
          </li>
          <li>
            Inviarti offerte e novità sulla carta, solo se hai spuntato il consenso facoltativo (art. 6.1.a): puoi
            revocarlo in qualsiasi momento dal link presente in ogni messaggio o chiedendolo in negozio.
          </li>
          <li>
            Proteggere il servizio da abusi e frodi (controllo anti-bot, limiti agli SMS): legittimo interesse (art.
            6.1.f).
          </li>
        </ul>

        <h2>A chi li comunichiamo</h2>
        <p>
          Solo ai fornitori necessari al servizio, nominati responsabili o sub-responsabili: hosting e database
          dell&apos;applicazione, invio degli SMS di verifica (Twilio), controllo anti-bot (Cloudflare Turnstile) e il
          Wallet del tuo telefono (Google Wallet o Apple Wallet), che riceve i dati mostrati sulla carta. Alcuni
          fornitori possono trattare dati fuori dall&apos;Unione europea con le garanzie previste dal GDPR (clausole
          contrattuali standard).
        </p>

        <h2>Per quanto tempo</h2>
        <p>
          Finché la carta è attiva. Puoi chiederne la cancellazione in qualsiasi momento in negozio: nome e telefono
          vengono cancellati e lo storico resta solo in forma anonima. I registri tecnici del servizio sono conservati
          al massimo 30 giorni.
        </p>

        <h2>I tuoi diritti</h2>
        <p>
          Puoi chiedere accesso, rettifica, cancellazione, limitazione, portabilità dei dati e opporti al trattamento
          (artt. 15–22 GDPR) scrivendo a <V value={email} label="email privacy del negozio" />. Puoi anche proporre
          reclamo al Garante per la protezione dei dati personali (www.garanteprivacy.it).
        </p>
      </article>
    </main>
  );
}
