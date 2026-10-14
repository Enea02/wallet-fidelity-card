# Loyalty Wallet

Carta fedeltà a timbri (es. "10 tagli = 1 gratis") su **Google Wallet** e **Apple Wallet** per piccoli negozi.
Multi-tenant, venduta in abbonamento. Requisiti e fasi di sviluppo: [`docs/brief-claude-code.md`](docs/brief-claude-code.md).

## Avvio locale (meno di 10 minuti)

Prerequisiti, una volta sola:

| Strumento      | Versione | Installazione                                                                                        |
| -------------- | -------- | ---------------------------------------------------------------------------------------------------- |
| Node.js        | 24       | `nvm install` (legge `.nvmrc`) o [nodejs.org](https://nodejs.org)                                    |
| pnpm           | 11       | `corepack enable pnpm` (se chiede permessi: `corepack enable --install-directory ~/.local/bin pnpm`) |
| Docker Desktop | recente  | [docker.com](https://www.docker.com/products/docker-desktop/), deve essere **avviato**               |
| Supabase CLI   | ≥ 2.98   | `brew install supabase/tap/supabase`                                                                 |

Poi:

```bash
pnpm i
pnpm dev
```

`pnpm dev` avvia Supabase in locale (migrazioni e dati di prova inclusi), crea `apps/web/.env.local` al primo avvio
e lancia il web su <http://localhost:3000>. All'avvio il server scrive una riga che riepiloga ambiente, versione e
servizi attivi (`server.startup.ok`); se manca una variabile il server non parte e dice quale.

Dati di prova (`supabase/seed.sql`, **solo locale**):

| Cosa                 | Valore                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------ |
| Negozio              | `salone-demo` → <http://localhost:3000/salone-demo>                                        |
| Titolare             | `staff@salone-demo.test` / `password-demo-locale` (Giulia, salone-demo)                    |
| Operatore            | `operatore@salone-demo.test` / `password-demo-locale` (Marco, salone-demo e barbiere-demo) |
| Secondo negozio      | `barbiere-demo`, senza tempo minimo tra due timbri (test)                                  |
| Cliente con QR fisso | contenuto del QR: `0123456789abcdef0123456789abcdef`, codice breve `DEMA2345`              |
| Supabase Studio      | <http://127.0.0.1:54323>                                                                   |

Google Wallet è disattivato finché non si compilano `GOOGLE_WALLET_*` in `apps/web/.env.local`: iscrizioni e timbri
funzionano lo stesso, senza il pulsante "Aggiungi a Google Wallet".

## Comandi

| Comando                           | Cosa fa                                                                                   |
| --------------------------------- | ----------------------------------------------------------------------------------------- |
| `pnpm dev`                        | Supabase locale + web in sviluppo                                                         |
| `pnpm build`                      | build di produzione di tutte le app                                                       |
| `pnpm typecheck`                  | TypeScript strict su tutto il monorepo                                                    |
| `pnpm lint`                       | ESLint                                                                                    |
| `pnpm format` / `format:check`    | Prettier (scrive / verifica)                                                              |
| `pnpm test`                       | test unitari (Vitest) di `packages/shared` e `apps/web`                                   |
| `pnpm test:smoke`                 | iscrizione, timbro, permessi e diagnostica sul Supabase locale (richiede `pnpm db:start`) |
| `pnpm runbook` / `runbook:check`  | rigenera / verifica eventi ed errori in `docs/runbook-assistenza.md`                      |
| `pnpm diag list\|enable\|disable` | modalità diagnostica per negozio, staff o cliente (vedi runbook)                          |
| `pnpm api:try`                    | esegue la raccolta Bruno delle API esercente (server avviato)                             |
| `pnpm db:start` / `db:stop`       | avvia / ferma Supabase locale                                                             |
| `pnpm db:reset`                   | ricrea il DB locale da migrazioni + seed (**cancella i dati locali**)                     |
| `pnpm db:new <nome>`              | crea una nuova migrazione in `supabase/migrations/`                                       |
| `pnpm db:migrate`                 | applica le migrazioni non ancora applicate al DB locale                                   |

La CI (GitHub Actions) esegue su ogni push e pull request: format, allineamento del runbook, typecheck, lint, test,
build, gitleaks su tutta la storia e uno Supabase locale con migrazioni, seed e smoke test.

## API dell'app esercente

- Tutte sotto `/api/v1/merchant/*`, con contratti zod condivisi in `packages/shared/api/` (registro `merchantApi`).
- Autenticazione: bearer token di Supabase Auth; il negozio su cui si opera va nell'header `X-Shop-Id`.
  Operatore: scansione, timbri, riscatti, diagnostica. Titolare: anche statistiche, clienti, impostazioni, staff,
  promozioni, cartello PDF.
- Documentazione navigabile (solo in sviluppo): <http://localhost:3000/api/v1/docs>.
- Raccolta di richieste di esempio in [`bruno/`](bruno/README.md): `pnpm api:try` la esegue tutta con il server avviato.
- Rate limit in Postgres (120/min per utente, 300/min per IP), CORS solo per `MERCHANT_APP_ORIGINS`.

## Log e diagnostica

- Ogni riga di log è un evento del catalogo `packages/shared/logging/events.ts` con un `msg` in italiano; gli errori
  hanno un codice del catalogo `packages/shared/errors.ts`. Descrizioni, cause e azioni per l'assistenza sono in
  [`docs/runbook-assistenza.md`](docs/runbook-assistenza.md).
- In sviluppo i log sono leggibili (`10:32:14 INFO  … [evento · ERR-7K3QX]`), in produzione JSON su stdout.
  `LOG_FORMAT=json` per vedere il JSON anche in locale.
- In produzione Vercel inoltra stdout ad **Axiom** con un Log Drain (Project → Settings → Log Drains, integrazione
  Axiom): nessuna configurazione nel codice.
- Ogni risposta API ha l'header `X-Request-Id`; gli errori hanno la forma
  `{ "error": { "code", "message", "support_code" } }` con il codice assistenza `ERR-XXXXX` da comunicarci.
- Token, password, OTP, JWT, chiavi, `qr_token` e telefoni vengono redatti automaticamente in ogni riga.

## Struttura

```
apps/
  web/            Next.js 16: API, pagine pubbliche di iscrizione, (poi) pannello interno
  merchant/       app esercente Expo (iOS, Android, Web): dalla Fase 6
packages/
  shared/         codice condiviso: catalogo eventi di log, catalogo errori, logger e redazione, request_id, env
supabase/
  migrations/     schema del database, una migrazione per modifica
  seed.sql        dati di prova per lo sviluppo locale
scripts/          script di supporto (avvio DB locale)
docs/             brief, design, runbook dell'assistenza
```

Dentro `apps/web`:

- `src/lib/loyalty.ts` — dominio (iscrizione, timbri, riscatti)
- `src/lib/wallet/notifier.ts` — unico punto di contatto dominio → wallet
- `src/lib/observability/` — `withApi` (request_id, log di richiesta, errori standard), logger del server,
  `fetchExternal`, modalità diagnostica
- `src/lib/wallet/google.ts` — LoyaltyClass, LoyaltyObject, JWT "Salva", notifiche
- `src/lib/wallet/apple.ts` — `pass.json` pronto, firma e web service in Fase 12
- `src/lib/server-env.ts` — variabili d'ambiente validate all'avvio (documentate in `apps/web/.env.example`)

| Percorso                      | Cosa fa                                            |
| ----------------------------- | -------------------------------------------------- |
| `/<slug>`                     | iscrizione cliente                                 |
| `/<slug>/qr`                  | cartello con QR da stampare per il bancone         |
| `POST /api/enroll`            | crea cliente + carta Google, ritorna il link Salva |
| `/api/v1/merchant/*`          | API dell'app esercente (vedi sopra)                |
| `POST /api/admin/setup-class` | crea/aggiorna il template Google del negozio       |

## Google Wallet (Demo mode)

1. Google Cloud Console → nuovo progetto → abilita **Google Wallet API**.
2. IAM → Service account → crea → Chiavi → aggiungi chiave JSON.
3. [Google Pay & Wallet Console](https://pay.google.com/business/console) → Google Wallet API: annota l'**Issuer ID**
   (numero di ~19 cifre, non il Merchant ID `BCR2DN…`).
4. Nella console Wallet → Users: aggiungi l'email del service account con ruolo **Developer**.
5. Sempre lì, aggiungi come **test user** l'account Google del telefono Android su cui provi.
6. In `apps/web/.env.local`: `GOOGLE_WALLET_ISSUER_ID=<issuer id>` e
   `GOOGLE_WALLET_SA_KEY_B64=$(base64 -i service-account.json | tr -d '\n')`. Non committare mai la chiave.
7. Logo: Google scarica il logo del negozio (o `CARD_DEFAULT_LOGO_URL`) da internet; in locale un indirizzo
   `localhost` non è raggiungibile, quindi per le prove usare un URL pubblico.

Template e carte si creano e si aggiornano da soli (iscrizione, timbri, impostazioni). Per forzare:
`pnpm wallet:resync --shop <slug> [--card <codice breve>]`.

In Demo mode le carte funzionano davvero ma mostrano "TEST ONLY" e solo i test user possono salvarle.

### Sincronizzazione e cron

- Dopo ogni modifica la carta viene aggiornata **dopo** aver risposto all'app; se Google fallisce si riprova tra 1, 5,
  15 e 60 minuti. Stato per carta in `wallet_sync_state`, tentativi in `wallet_sync_failures`.
- Il cron (ogni minuto, `pg_cron` di Supabase) chiama `POST /api/internal/cron/wallet-sync` con `CRON_SECRET`:
  nuovi tentativi, riallineamento delle carte rimaste indietro, invio delle promozioni.
- In locale `pnpm dev` lo configura verso `http://localhost:3000`. In produzione, una volta:
  `pnpm cron:configure --url https://<dominio>/api/internal/cron/wallet-sync` con le variabili di produzione.
