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
- Runbook: `pnpm runbook` rigenera eventi ed errori in `docs/runbook-assistenza.md` dai cataloghi (obbligatorio dopo ogni modifica ai cataloghi; la CI lo controlla)
- Modalità diagnostica: `pnpm diag list|enable|disable` (vedi runbook)
- Prima di dire che una fase è finita: `pnpm format:check && pnpm runbook:check && pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm test:smoke`

## Logging (Fase 1) — come si usa
- Route handler pubbliche: `export const POST = withApi(async (req) => …)` (`apps/web/src/lib/observability/with-api.ts`); body con `parseJsonBody(req, schema)`.
- API esercente (`/api/v1/merchant/*`): prima il contratto in `packages/shared/api/` (schemi zod + voce nel registro `merchantApi`), poi la route con `export const POST = merchantRoute("chiave", async ({ shop, staff, body, actor }) => …)` ed `export const OPTIONS = preflight`. `merchantRoute` fa CORS, rate limit, autenticazione, X-Shop-Id, ruolo e validazione; aggiungere la route anche a `apps/web/test/support/merchant.ts` (la matrice dei permessi la prova da sola).
- Errori: `throw new AppError("E_…", "messaggio tecnico con i valori", contesto)`; codici solo da `packages/shared/errors.ts`. Un errore si logga una volta: se un evento di dominio lo registra (es. `stamp.add.rejected_cooldown`) e poi lo si rilancia, impostare `error.logged = true` (vedi `onRejected` in `loyalty.ts`).
- Dominio: timbri, premi e dati dei clienti cambiano solo con le funzioni Postgres (`supabase/migrations/*_funzioni_dominio.sql`), che scrivono `audit_log`; gli errori Postgres `E_…` diventano AppError in `apps/web/src/lib/db-errors.ts`.
- Log: `log.event("dominio.oggetto.azione", campi)` da `@/lib/observability/logger`; nuovi eventi prima nel catalogo con `msg` ed `examples`, poi `pnpm runbook`.
- Dopo l'autenticazione o il caricamento di negozio/carta: `setContext({ shop_id, user_id, customer_ref })` così tutte le righe della richiesta li hanno.
- Chiamate HTTP esterne: `fetchExternal({ provider, operation, url, … })`, che logga da sé (`quiet: true` se l'esito lo registra un evento più specifico).
- Web pubblico: niente dati personali in URL o log (telefono sempre mascherato, nome mai); ogni passo dell'iscrizione ha il suo evento `enroll.*` con `enrollment_id`. Colori sempre da `packages/shared/theme.ts` (porting di `lw-core.js`). Test end-to-end con `pnpm e2e`.
- Wallet: il dominio chiama solo `notifyCardChanged(shop, customerId, change)` (`apps/web/src/lib/wallet/notifier.ts`); la sincronizzazione (`wallet/sync.ts`) invia sempre lo stato completo, registra ogni tentativo e ritenta da sé. Non chiamare Google da altre parti.
- App esercente (`apps/merchant`): chiamate al backend solo con `api.call("<chiave del registro>", { shopId, body })` (`src/lib/api`), che aggiunge token, `X-Request-Id`, piattaforma e versione, valida la risposta e lancia `ApiError` con `userMessage` e `supportCode` (mostrarli con `<ErrorNotice>`). Log dell'app con `log.event("app.…")` da `src/lib/diagnostics/logger` (eventi `app.*` del catalogo, finiscono nel buffer di "Invia diagnostica" e in Sentry). Colori solo da `useTheme()`, componenti da `src/ui/`. Le azioni che richiedono il server vanno disattivate con `useOnline()`. Test end-to-end della web app in `apps/merchant/e2e` (`pnpm e2e`).
- Scanner e scheda cliente (`apps/merchant/src/features/scan`, `features/card`): le azioni sul saldo passano solo da `useCardActions`, che genera la chiave di idempotenza del tocco (header `Idempotency-Key`, obbligatorio per `stamp`, `undo`, `redeem`) e la riusa se la rete non risponde. Lato server queste azioni passano da `card_action` (Postgres), mai direttamente da `add_stamp`/`undo_last_stamp`/`redeem_reward`. Ogni lettura scrive `scan.read.ok` o `scan.read.invalid`.
