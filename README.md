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

## Web pubblico di iscrizione

- `/<slug>`: iscrizione del cliente (design "Cliente"), con verifica del telefono via SMS (Twilio Verify), anti-bot
  Cloudflare Turnstile e pulsante Wallet giusto per il dispositivo. Tema dal colore del negozio
  (`packages/shared/theme.ts`, porting di `docs/design/lw-core.js`).
- `/<slug>/qr` (cartello A5 stampabile) e `/<slug>/qr.pdf`, `/<slug>/privacy` (informativa), `/u/<token>`
  (disiscrizione dalle promozioni), `/<slug>/c/<token>` (apre la carta dal telefono, QR mostrato sul computer).
- In locale: `OTP_PROVIDER=test` (nessun SMS, codice **123456**) e chiavi di prova di Turnstile, impostati da `pnpm dev`.
- Test end-to-end: `pnpm e2e` (build di produzione + Playwright, serve `pnpm db:start`). Lighthouse mobile:
  `pnpm lighthouse` con il server di produzione avviato sulla porta 3200.

### Da completare con gli account (segnaposto)

| Cosa        | Dove                                                                                        | Variabili                                                                                     |
| ----------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| SMS veri    | console Twilio: Account SID, Auth Token; Verify → crea un servizio → SID `VA…`              | `OTP_PROVIDER=twilio`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID` |
| Anti-bot    | dash.cloudflare.com → Turnstile → aggiungi widget "Managed" con il dominio                  | `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`                                      |
| Informativa | dati della nostra azienda (responsabile del trattamento); testo da far rivedere a un legale | `PROCESSOR_NAME`, `PROCESSOR_ADDRESS`, `PROCESSOR_VAT`, `PROCESSOR_EMAIL`                     |

Finché mancano, l'informativa mostra "[… da completare]" evidenziato e in produzione il server non parte senza Twilio
(il codice di prova è vietato con `APP_ENV=production`).

## API dell'app esercente

- Tutte sotto `/api/v1/merchant/*`, con contratti zod condivisi in `packages/shared/api/` (registro `merchantApi`).
- Autenticazione: bearer token di Supabase Auth; il negozio su cui si opera va nell'header `X-Shop-Id`.
  Operatore: scansione, timbri, riscatti, diagnostica. Titolare: anche statistiche, clienti, impostazioni, staff,
  promozioni, cartello PDF.
- Documentazione navigabile (solo in sviluppo): <http://localhost:3000/api/v1/docs>.
- Raccolta di richieste di esempio in [`bruno/`](bruno/README.md): `pnpm api:try` la esegue tutta con il server avviato.
- Rate limit in Postgres (120/min per utente, 300/min per IP), CORS solo per `MERCHANT_APP_ORIGINS`.

## App esercente (iOS, Android, Web)

Expo SDK 57 + Expo Router in `apps/merchant`, una sola codebase per le tre piattaforme. Utenti di prova (seed):
`staff@salone-demo.test` (titolare) e `operatore@salone-demo.test` (operatore di due negozi), password
`password-demo-locale`.

| Dove              | Comando                                                                         |
| ----------------- | ------------------------------------------------------------------------------- |
| Browser           | `pnpm dev:merchant` → <http://localhost:8081> (avvia anche il backend su :3000) |
| Simulatore iOS    | con il backend avviato (`pnpm dev`): `pnpm --filter @loyalty/merchant ios`      |
| Emulatore Android | con il backend avviato (`pnpm dev`): `pnpm --filter @loyalty/merchant android`  |

- La prima build nativa genera `ios/` e `android/` (non versionate, si configurano da `app.config.ts`) e richiede
  Xcode / Android Studio; le successive aprono solo l'app. Sull'emulatore Android `localhost` diventa `10.0.2.2`.
- `pnpm db:start` crea `apps/merchant/.env.local` (solo valori pubblici, vedi `apps/merchant/.env.example`).
- Email di invito e "Password dimenticata?" in locale: Mailpit su <http://127.0.0.1:54324>.
- Struttura: `src/app/` rotte (Expo Router), `src/lib/api/client.ts` client unico delle API,
  `src/lib/session.tsx` sessione e negozio attivo, `src/lib/diagnostics/` logger, buffer, Sentry e "Invia
  diagnostica", `src/ui/` componenti del design system.
- Web app installabile (PWA): `public/manifest.webmanifest` e `public/sw.js` (in cache solo i file dell'app, mai
  i dati). `pnpm --filter @loyalty/merchant build` esporta in `apps/merchant/dist`.
- Test: `pnpm --filter @loyalty/merchant test` (unitari), `pnpm e2e` (web pubblico + web app esercente;
  serve `pnpm db:start`).

### Scanner e timbratura

- Tre modalità, ricordate sul dispositivo: **Fotocamera** (iOS/Android con `expo-camera`; web con `BarcodeDetector`
  o il polyfill ZXing, il cui `.wasm` viene copiato in `public/zxing/` da `scripts/copy-zxing.mjs` prima di `dev` e
  `build`), **Lettore** (lettore QR USB/Bluetooth che scrive il codice e preme Invio: il campo resta sempre a fuoco)
  e **Codice** (codice breve a mano).
- Timbro, annullamento e riscatto mandano l'header `Idempotency-Key` (uno per tocco): il backend non agisce due volte
  con la stessa chiave. Dopo un timbro "+1" resta bloccato 1 secondo (doppio tocco). "Aggiungi comunque" forza il
  timbro durante il cooldown e resta nell'audit.
- Per provare il lettore senza averne uno: modalità Lettore, scrivere il codice breve (es. `DEMA2345` della carta
  demo) e premere Invio. Il simulatore iOS non ha fotocamera.
- Test: `pnpm --filter @loyalty/merchant test` (Vitest per la logica, jest-expo per i componenti), `pnpm e2e` (anche
  la webcam, con un video finto che mostra un QR).
- **Su un iPhone vero** (basta un Apple ID gratuito aggiunto in Xcode → Settings → Accounts; telefono collegato via
  cavo con la Modalità sviluppatore attiva):
  1. in `apps/merchant/.env.local` mettere l'IP del Mac in rete al posto di `localhost` (API e Supabase);
  2. `APPLE_TEAM_ID=<team> npx expo prebuild --platform ios --clean` (il team è in Xcode → Settings → Accounts);
  3. `xcodebuild -workspace ios/LoyaltyWalletEsercente.xcworkspace -scheme LoyaltyWalletEsercente -configuration Debug -destination id=<UDID> -allowProvisioningUpdates -derivedDataPath build-iphone build`,
     poi `xcrun devicectl device install app --device <UDID> build-iphone/Build/Products/Debug-iphoneos/LoyaltyWalletEsercente.app`;
  4. sul telefono: Impostazioni → Generali → VPN e gestione dispositivi → autorizza lo sviluppatore.

  Su iOS 27 serve il ciclo di vita a scene: lo applica `plugins/with-scene-lifecycle.js` a ogni prebuild. Metro va
  avviato senza `CI=1` (in modalità CI non si accorge delle modifiche e serve codice vecchio). Alla fine
  `pnpm db:start` riporta `.env.local` su `localhost`.

### Da completare con gli account (segnaposto)

| Cosa            | Dove                                                                   | Variabili                                                                                           |
| --------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Crash ed errori | sentry.io → nuovo progetto React Native → DSN; Settings → Auth Tokens  | `EXPO_PUBLIC_SENTRY_DSN`; `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` (EAS secret e GitHub) |
| Build nel cloud | expo.dev → crea account → `npx eas-cli@latest init` in `apps/merchant` | `EAS_PROJECT_ID`                                                                                    |

Senza DSN Sentry resta spento (il buffer locale e "Invia diagnostica" funzionano comunque); senza account Expo le
build di sviluppo si fanno in locale con `expo run:ios` / `expo run:android`.

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
  merchant/       app esercente Expo (iOS, Android, Web)
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
