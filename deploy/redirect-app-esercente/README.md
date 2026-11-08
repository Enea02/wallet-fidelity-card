# Vecchio indirizzo della web app esercente → nuovo server unico

Prima dell'unificazione la web app esercente era un progetto Vercel a sé (radice `apps/merchant`). Ora è servita dal
server del sito su `https://<dominio>/app`. Questa cartella sostituisce il vecchio progetto:

- ogni indirizzo (`/accedi`, `/clienti/…`, `/invito#…`) porta allo stesso percorso sotto il nuovo indirizzo, con query
  e frammento (i link d'invito già inviati continuano a funzionare);
- `/sw.js` è un service worker che cancella le vecchie cache e si disinstalla: chi aveva installato la PWA o la usava
  dal browser non resta bloccato sulla versione vecchia.

## Configurazione del vecchio progetto Vercel

1. Settings → General → Root Directory: `deploy/redirect-app-esercente`.
2. Settings → Environment Variables: `NUOVO_URL_APP=https://<dominio>/app` (senza `/` finale).
3. Redeploy. Verifica: aprire il vecchio indirizzo → si arriva su `https://<dominio>/app/…`.

Quando nessuno usa più il vecchio indirizzo (log di Vercel senza visite per qualche settimana) il progetto si può
eliminare.
