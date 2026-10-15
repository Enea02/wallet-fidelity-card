import { router, useLocalSearchParams } from "expo-router";
import { CustomerDetail } from "@/features/owner/customers/CustomerDetail";
import { Button } from "@/ui/Button";
import { Screen } from "@/ui/Screen";

/** Dettaglio del cliente su mobile (su desktop è affiancato alla lista in /clienti). */
export default function ClienteDettaglio() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const back = () => (router.canGoBack() ? router.back() : router.replace("/clienti"));
  return (
    <Screen maxWidth={640}>
      <Button
        label="← Clienti"
        variant="ghost"
        onPress={back}
        style={{ alignSelf: "flex-start", paddingHorizontal: 0 }}
      />
      <CustomerDetail customerId={String(id)} onChanged={() => undefined} onDeleted={back} />
    </Screen>
  );
}
