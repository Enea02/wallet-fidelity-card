# Loyalty Wallet — istruzioni per Claude Code

Carta fedeltà a timbri su Google Wallet / Apple Wallet per piccoli negozi, multi-tenant, venduta in abbonamento.

## Documenti di riferimento (leggili prima di ogni fase)
- `docs/brief-claude-code.md` — requisiti, regole, logging e **fasi di sviluppo**. È la fonte di verità.
- `docs/design/` — output di Claude Design (design system, schermate, asset carta). La UI deve seguirlo.
- `docs/runbook-assistenza.md` — da aggiornare a ogni fase.

## Come lavoriamo
- Una fase alla volta, nell'ordine del brief. Inizia sempre proponendo un piano e aspetta conferma.
- A fine fase fermati e consegna il riepilogo previsto in "Cosa consegnare a ogni fase". Non iniziare la fase successiva da solo.
- Se una decisione non è coperta dal brief, chiedi.
- Un commit per ogni passo significativo, messaggi in italiano, branch `fase-N-<nome>`.

## Regole fisse
- Interfacce in italiano. TypeScript strict. Nessun segreto nei client.
- Il cliente finale non ha login né area personale: solo pagina web di iscrizione + carta nel Wallet.
- Tutto l'operativo e il gestionale sta nell'app esercente (Expo: iOS, Android, Web).
- Timbri e premi cambiano solo tramite funzioni Postgres atomiche che scrivono anche `audit_log`.
- **Log chiari**: solo eventi del catalogo `packages/shared/logging/events.ts`, ogni riga con `msg` in italiano comprensibile senza leggere il codice; errori solo dal catalogo `packages/shared/errors.ts`. Una feature senza log adeguati non è finita.
- Mai in chiaro nei log: token, OTP, password, chiavi, JWT, `qr_token`, telefono.

## Comandi
Monorepo pnpm + Turborepo (Node 24, pnpm 11). Prerequisiti: Docker avviato, Supabase CLI.
- Install: `pnpm i`
- Dev: `pnpm dev` (avvia Supabase locale, crea `apps/web/.env.local` al primo avvio, web su :3000)
- Typecheck / lint / format: `pnpm typecheck` · `pnpm lint` · `pnpm format:check` (`pnpm format` per correggere)
- Test: `pnpm test` (unitari) · `pnpm test:smoke` (iscrizione + timbro su Supabase locale)
- Build: `pnpm build`
- Migrazioni: `pnpm db:new <nome>` crea, `pnpm db:reset` ricrea il DB locale da migrazioni + `supabase/seed.sql`
- Prima di dire che una fase è finita: `pnpm format:check && pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm test:smoke`
