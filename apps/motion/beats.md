# Beat sheet — Loyalty Wallet, promo 25 s

**Fonte unica dei tempi.** Il motore legge questa tabella: `battute` decide inizio e fine di ogni scena, `sfx` diventa i
marker per DaVinci Resolve (`pnpm --filter @loyalty/motion markers`). I secondi dipendono da `music.json`: oggi è una
griglia segnaposto a **120 BPM** (1 battuta = 0,5 s, 50 battute = 25 s). Quando c'è il brano vero, `pnpm --filter
@loyalty/motion beats music/<brano>.mp3` scrive i beat rilevati e tutto si riallinea da solo.

- **Battute**: intervallo assoluto `inizio–fine`, frazioni ammesse (`10.5–16`). Le scene non si sovrappongono.
- **SFX**: `nome@battuta` separati da `;`, battuta **relativa all'inizio della scena**. Sono solo cue: i suoni veri li
  scegli e posizioni tu nel montaggio.
- Pubblico: titolari di piccoli negozi (parrucchieri, bar, estetiste). Tono diretto, frasi corte, niente gergo.

| #   | id            | battute | cosa si vede                                                                                                             | animazione                                                                        | uscita                                       | sfx                                                                                                             |
| --- | ------------- | ------- | ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 1   | 01-hook       | 0–4     | sfondo vino, "La tessera di carta?", tessera di cartone con 4 timbri a inchiostro                                        | parole dal basso ogni mezzo beat; la tessera sbatte sul beat 2 (shake)            | tessera che cade + titolo che sale (beat 3)  | tick@0; tick@0.5; tick@1; slam@2; fall@3                                                                        |
| 2   | 02-problema   | 4–10    | un cartello per beat: Si perde. / Si rovina. / Si dimentica. / E l'app del negozio? / Non la scarica nessuno.            | taglio netto sul beat, entrata con blur e scale, deriva lenta                     | taglio netto                                 | hit@0; hit@1; hit@2; hit@3; hit@4.5; scratch@5.25                                                               |
| 3   | 03-wallet     | 10–16   | cerchio color carta dal centro; telefono con il Wallet; la carta Salone Demo cade dentro; "Nel Wallet. Sempre in tasca." | maschera a cerchio (beat 0), carta con rimbalzo (beat 1), parole (beat 1.5 e 2.5) | spinta della camera dentro la carta (beat 4) | whoosh@0; drop@1; pop@1.5; pop@2.5; riser@4                                                                     |
| 4   | 04-timbri     | 16–24   | carta a tutto schermo, 9 timbri + premio con coriandoli; "Ogni timbro li riporta da te."                                 | un timbro ogni mezzo beat da 0.5; premio sul beat 5 con anello e punch            | whip verso l'alto (beat 7.5)                 | stamp@0.5; stamp@1; stamp@1.5; stamp@2; stamp@2.5; stamp@3; stamp@3.5; stamp@4; stamp@4.5; reward@5; whoosh@7.5 |
| 5   | 05-iscrizione | 24–30   | tre telefoni con le schermate reali: modulo, codice SMS, carta pronta; "Niente app da scaricare."                        | un telefono per beat dal basso, etichette numerate; titolo sul beat 3             | whip a sinistra (beat 5.5)                   | swoosh@0; swoosh@1; swoosh@2; impact@3; whoosh@5.5                                                              |
| 6   | 06-cassa      | 30–36   | telefono dell'operatore: scanner → timbro aggiunto → premio sbloccato; frasi a sinistra                                  | whip in da destra; cambio schermata con flash sui beat 2 e 4                      | taglio netto                                 | whoosh@0; click@2; ding@2; click@4; reward@4                                                                    |
| 7   | 07-titolare   | 36–42   | web app del titolare: panoramica → messaggi; "Vedi chi torna." / "Richiamali con un messaggio."                          | entrata in prospettiva; zoom sui numeri (beat 1.75); taglio sui messaggi (beat 4) | taglio netto                                 | whoosh@0; zoom@1.75; pop@2; cut@4; pop@4                                                                        |
| 8   | 08-chiusura   | 42–50   | logo, "Loyalty Wallet", "Più clienti che tornano. Nessuna app da scaricare.", invito alla demo                           | logo che ruota (beat 0), nome (0.5), claim (2), CTA (4); respiro lento            | fine                                         | impact@0; pop@2; pop@4; tail@6                                                                                  |

## Voce

Voce femminile, italiana, vivace e sorridente; ritmo serrato ma parole pulite. **Una riga = un file audio** in `voce/`
(`pnpm --filter @loyalty/motion voce gen`), così ogni frase si sposta e si rigenera da sola.

- **battuta**: assoluta. `4` = la prima parola cade sul beat 4; `21@premio` = la parola "premio" cade sul beat 21 (la
  frase parte prima quanto serve). Per agganciare una parola servono i tempi delle parole (`voce align`, o ElevenLabs
  che li dà da sé).
- **fine** (facoltativa): battuta entro cui l'ultima parola deve finire; se la frase è più lunga viene accelerata senza
  cambiare intonazione, al massimo ×1,3 (oltre: accorcia il testo).
- Il testo a schermo può seguire la voce: nelle scene `w("parola", battutaDiRiserva)`.

| riga | battuta      | testo                                               | fine  |
| ---- | ------------ | --------------------------------------------------- | ----- |
| v01  | 0.5          | La tessera di carta?                                | 3     |
| v02a | 4            | Si perde.                                           | 5     |
| v02b | 5            | Si rovina.                                          | 6     |
| v02c | 6            | Si dimentica.                                       | 7.25  |
| v02d | 7.25         | E l'app?                                            | 8.4   |
| v02e | 8.5          | Non la scarica nessuno!                             | 10.5  |
| v03a | 11.75@wallet | Ora è nel Wallet.                                   | 12.75 |
| v03b | 12.75        | Sempre in tasca.                                    | 15    |
| v04a | 17           | Un timbro a ogni visita…                            | 19.1  |
| v04b | 21@premio    | …al decimo, il premio!                              | 22.5  |
| v05  | 27@niente    | Si iscrivono in un attimo: niente app da scaricare. | 29.5  |
| v06  | 32@tocco     | In cassa? Un tocco, e il timbro è dato.             | 34.5  |
| v07a | 38@vedi      | E tu vedi chi torna…                                | 39.5  |
| v07b | 40           | Richiamali con un messaggio.                        | 42.3  |
| v08  | 42.5         | Loyalty Wallet. Più clienti che tornano.            | 47    |
