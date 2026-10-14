import { useShop } from "@/lib/session";
import { Placeholder } from "@/ui/Placeholder";
import { T } from "@/ui/Text";

const greeting = (h: number) => (h < 13 ? "Buongiorno" : h < 18 ? "Buon pomeriggio" : "Buonasera");

export default function Panoramica() {
  const shop = useShop();
  return (
    <Placeholder
      title={`${greeting(new Date().getHours())}${shop.displayName ? `, ${shop.displayName}` : ""}`}
      icon="home"
      intro={<T tone="ink2">{shop.name}</T>}
    >
      Qui vedrai i numeri della settimana: timbri, premi, nuovi clienti e clienti inattivi, con il cartello da bancone
      da scaricare.
    </Placeholder>
  );
}
