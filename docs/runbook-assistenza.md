# Runbook assistenza

Come diagnosticare i problemi più probabili partendo dai log. Dalla Fase 1 le sezioni **Eventi** ed **Errori** sono
generate dai cataloghi (`packages/shared/logging/events.ts`, `packages/shared/errors.ts`); fino ad allora sono
mantenute a mano e devono restare allineate ai cataloghi.

## Avvio del server

**Sintomo**: il sito non risponde dopo un deploy, oppure risponde con errore 500 su tutte le pagine.

1. Cercare nei log l'evento `server.startup.failed`: il `msg` elenca le variabili mancanti o malformate.
2. Correggere le variabili nell'hosting confrontandole con `apps/web/.env.example` e rifare il deploy.
3. Verificare che compaia `server.startup.ok`: il `msg` riepiloga ambiente, versione, commit e servizi attivi
   (Google Wallet / Apple Wallet attivo o disattivato). Se un wallet risulta "disattivato" in produzione mancano le
   sue variabili.

## Eventi

| Evento                  | Livello | Significato                                                                                       |
| ----------------------- | ------- | ------------------------------------------------------------------------------------------------- |
| `server.startup.ok`     | info    | Il server è partito e la configurazione è valida. Riepiloga ambiente, versione e servizi attivi. |
| `server.startup.failed` | error   | Il server non è partito perché la configurazione non è valida. Elenca le variabili da correggere. |

## Errori

| Codice             | Descrizione                                                                                     | Causa probabile                                                                                 | Azione                                                                                                    |
| ------------------ | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `E_CONFIG_INVALID` | Il server non si avvia perché una o più variabili d'ambiente mancano o hanno un formato non valido. | Variabile non impostata nel deploy o nel file .env.local, oppure copiata male (spazi, virgolette, base64 troncato). | Confrontare le variabili del deploy con .env.example dell'app indicata nel log; correggere quelle elencate e riavviare. |
