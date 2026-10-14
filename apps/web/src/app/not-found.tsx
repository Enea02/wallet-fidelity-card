import { StatusScreen } from "./_components/StatusScreen";

export default function NotFound() {
  return (
    <StatusScreen title="Pagina non trovata">
      <p className="lw-lead">Inquadra di nuovo il QR al bancone del negozio o chiedi il link in cassa.</p>
    </StatusScreen>
  );
}
