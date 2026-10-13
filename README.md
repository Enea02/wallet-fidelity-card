# Loyalty Wallet

Carta fedeltà a timbri (es. "10 tagli = 1 gratis") su **Google Wallet**, con **Apple Wallet** predisposto.
Multi-tenant: un deploy serve più negozi.

Stack: Next.js 16 (App Router) · Supabase (Postgres + Auth) · Google Wallet API · deploy su Vercel.

## Come funziona

```
Cliente: QR al bancone → /<negozio> → form + consensi → "Aggiungi a Google Wallet"
Staff:   /staff (PWA) → login → scansiona QR della carta → +1 timbro / riscatta premio
Backend: timbro atomico in Postgres → PATCH carta Google (+ notifica al premio sbloccato)
```

| Percorso | Cosa fa |
| --- | --- |
| `/<slug>` | Iscrizione cliente |
| `/<slug>/qr` | Cartello con QR da stampare per il bancone |
| `/staff` | App staff: login, scanner, timbri, riscatti |
| `POST /api/enroll` | Crea cliente + carta Google, ritorna il link Salva |
| `POST /api/staff/lookup` · `stamp` · `redeem` | Operazioni staff (bearer token Supabase) |
| `POST /api/admin/setup-class` | Crea/aggiorna il template Google del negozio |

Struttura del codice:

- `supabase/schema.sql` — tabelle, RLS, funzioni atomiche `add_stamp` / `redeem_reward`
- `src/lib/loyalty.ts` — dominio (iscrizione, timbri, riscatti)
- `src/lib/wallet/notifier.ts` — unico punto di contatto dominio → wallet
- `src/lib/wallet/google.ts` — LoyaltyClass, LoyaltyObject, JWT "Salva", notifiche
- `src/lib/wallet/apple.ts` — `pass.json` pronto, firma e web service da completare

## Setup (tutto gratuito)

### 1. Supabase
1. Crea un progetto su supabase.com.
2. SQL editor → esegui `supabase/schema.sql`.
3. Inserisci un negozio (esempio in fondo allo schema). `logo_url` deve essere un PNG pubblico quadrato.
4. Authentication → crea l'utente staff (email + password), poi inseriscilo in `staff` col suo `user_id`.

### 2. Google Wallet (Demo mode)
1. Google Cloud Console → nuovo progetto → abilita **Google Wallet API**.
2. IAM → Service account → crea → Chiavi → aggiungi chiave JSON.
3. [Google Pay & Wallet Console](https://pay.google.com/business/console) → Google Wallet API → crea l'account emittente, annota l'**Issuer ID**.
4. Nella console Wallet → Users: aggiungi l'email del service account (ruolo Developer).
5. Sempre lì, aggiungi come **test user** l'account Google del telefono Android su cui provi.

In Demo mode le carte funzionano davvero ma mostrano "TEST ONLY" e solo i test user possono salvarle.
Per andare in produzione: richiesta di "publishing access" dalla console.

### 3. Variabili d'ambiente
```bash
cp .env.example .env.local
base64 -w0 service-account.json   # → GOOGLE_WALLET_SA_KEY_B64
```
Compila tutte le voci tranne quelle Apple.

### 4. Avvio e primo test
```bash
npm install
npm run dev
# crea il template Google del negozio (una volta, e a ogni cambio nome/logo/colore)
curl -X POST localhost:3000/api/admin/setup-class \
  -H "x-admin-token: $ADMIN_SETUP_TOKEN" -H "content-type: application/json" \
  -d '{"shopSlug":"salone-mario"}'
```
Poi da Android (stessa rete o deploy Vercel): apri `/<slug>`, iscriviti, salva la carta.
Da un altro telefono apri `/staff`, scansiona il QR della carta e aggiungi un timbro: la carta si aggiorna da sola.

> La fotocamera dello scanner richiede HTTPS: in locale usa `next dev --experimental-https` o fai subito il deploy su Vercel.

## Attivare Apple Wallet (quando avrete l'account da 99 €)
1. Apple Developer → Identifiers → **Pass Type ID** → certificato → esporta `.p12` + scarica il certificato WWDR.
2. `npm i passkit-generator` e un client APNs (HTTP/2 con il certificato del pass).
3. In `src/lib/wallet/apple.ts`: genera il `.pkpass` da `passJson()`, implementa `notifyApple()`.
4. Aggiungi le route del web service Apple sotto `/api/apple/v1/...` (registrazione dispositivi in `apple_registrations`).
5. Nella pagina di iscrizione mostra "Aggiungi ad Apple Wallet" su iPhone.

Dominio, timbri e app staff non cambiano.

## Da fare prima di vendere
- **Verifica del telefono** (OTP via SMS) all'iscrizione: oggi chi conosce il numero di un cliente può riottenerne la carta.
- **Rate limit** su `/api/enroll` (es. Vercel Firewall o Upstash).
- **Informativa privacy** reale per negozio (`/privacy`) e accordo di responsabile del trattamento con il negozio.
- **Cooldown timbri** (es. max 1 timbro ogni X ore per cliente) contro timbri doppi involontari.
- Dashboard negozio (clienti, timbri, riscatti) a partire da `stamp_events`.
- Icone PWA in `src/app/manifest.ts`.
