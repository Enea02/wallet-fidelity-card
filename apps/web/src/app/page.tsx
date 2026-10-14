import { StatusScreen } from "./_components/StatusScreen";

export default function Home() {
  return (
    <StatusScreen title="Carta fedeltà digitale">
      <p className="lw-lead">
        Per avere la carta di un negozio inquadra il QR al bancone: niente app da scaricare, la carta va nel Wallet del
        telefono.
      </p>
    </StatusScreen>
  );
}
