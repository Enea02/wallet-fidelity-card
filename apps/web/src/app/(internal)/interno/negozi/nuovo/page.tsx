import { supportPage } from "@/lib/support/run";
import { ActionForm } from "../../_ui/ActionForm";
import { createShopAction } from "../actions";

export default async function NuovoNegozio() {
  return supportPage("/interno/negozi/nuovo", async () => (
    <section className="int-card" style={{ maxWidth: 640 }}>
      <h1>Nuovo negozio</h1>
      <p className="int-sub">
        Il titolare riceve un&apos;email d&apos;invito per scegliere la password e trova il negozio nell&apos;app.
        Colore, premio e timbri li imposta lui dall&apos;app.
      </p>
      <ActionForm action={createShopAction} submit="Crea negozio e invita il titolare" testId="crea-negozio">
        <label>
          Nome del negozio
          <input name="name" required maxLength={60} placeholder="Barberia Rossi" data-testid="negozio-nome" />
        </label>
        <label>
          Indirizzo della pagina di iscrizione
          <small>Solo minuscole, numeri e trattini: diventa il QR del cartello (/barberia-rossi).</small>
          <input name="slug" required maxLength={40} placeholder="barberia-rossi" data-testid="negozio-slug" />
        </label>
        <label>
          Nome del titolare
          <input name="ownerName" required maxLength={40} placeholder="Luca" data-testid="titolare-nome" />
        </label>
        <label>
          Email del titolare
          <input name="ownerEmail" type="email" required data-testid="titolare-email" />
        </label>
        <h2>Dati per l&apos;informativa privacy</h2>
        <label>
          Ragione sociale
          <input name="legalName" maxLength={120} placeholder="Barberia Rossi di Luca Rossi" />
        </label>
        <label>
          Partita IVA
          <input name="vatNumber" maxLength={20} />
        </label>
        <label>
          Email per le richieste privacy
          <input name="privacyEmail" type="email" />
        </label>
      </ActionForm>
    </section>
  ));
}
