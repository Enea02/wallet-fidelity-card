# Raccolta Bruno — API esercente

Una richiesta per ogni endpoint di `/api/v1/merchant/*`, eseguibili in ordine contro il server locale.
I login usano gli utenti del seed (Giulia titolare, Marco operatore) e salvano i token per le richieste successive.
Le operazioni distruttive usano id inesistenti: la raccolta si può rieseguire senza rovinare i dati di prova.

```bash
pnpm dev          # in un altro terminale
pnpm api:try      # esegue tutta la raccolta con la CLI di Bruno
```

Per l'uso interattivo aprire la cartella `bruno/` con l'app Bruno e scegliere l'ambiente `local`; la variabile
`anonKey` va impostata con il valore di `NEXT_PUBLIC_SUPABASE_ANON_KEY` di `apps/web/.env.local` (lo fa da solo
`pnpm api:try`). Documentazione degli endpoint: <http://localhost:3000/api/v1/docs> (solo in sviluppo).
