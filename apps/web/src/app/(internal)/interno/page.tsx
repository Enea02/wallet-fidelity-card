import { supportPage } from "@/lib/support/run";

export default async function Assistenza() {
  return supportPage("/interno", async (user) => (
    <section>
      <h1>Assistenza</h1>
      <p className="int-sub">Ciao {user.name}.</p>
    </section>
  ));
}
