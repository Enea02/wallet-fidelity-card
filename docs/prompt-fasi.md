# Prompt da usare in Claude Code

## Avvio di una fase (sessione nuova, in plan mode)
```
Leggi CLAUDE.md, docs/brief-claude-code.md e, se la fase ha interfaccia, docs/design/.
Lavoriamo sulla Fase N — <nome>.
Verifica i prerequisiti della fase e dimmi se manca qualcosa (account, chiavi, decisioni).
Poi proponi un piano dettagliato: file che crei o modifichi, migrazioni, eventi di log ed errori
che aggiungi ai cataloghi, test. Non scrivere codice finché non approvo il piano.
```

## Dopo l'approvazione del piano
```
Procedi con il piano. Fai commit a ogni passo significativo sul branch fase-N-<nome>.
Esegui typecheck, lint e test prima di dirmi che hai finito.
```

## Chiusura della fase
```
Verifica uno per uno i punti della Definition of Done della Fase N e dimmi quali sono soddisfatti
e quali no. Poi consegna il riepilogo previsto in "Cosa consegnare a ogni fase", con le righe
di log reali di un caso riuscito e di uno di errore, e aggiorna docs/runbook-assistenza.md.
```

## Revisione dei log (se non sono chiari)
```
Questi log non sono abbastanza chiari per l'assistenza: <incolla le righe>.
Riscrivi i template msg nel catalogo eventi in modo che una persona che non conosce il codice
capisca chi, cosa, su quale carta, esito e, in caso di errore, causa e azione da fare.
```

## Quando cambia un requisito
```
Cambia il requisito: <descrizione>. Aggiorna prima docs/brief-claude-code.md (e CLAUDE.md se serve),
mostrami il diff, poi dimmi quali fasi già fatte vanno toccate.
```
