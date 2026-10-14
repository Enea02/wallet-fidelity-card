import { SetPassword } from "@/screens/SetPassword";

/** Link dell'email d'invito dello staff (web /invito o deep link loyaltywallet://invito). */
export default function Invito() {
  return <SetPassword kind="invito" />;
}
