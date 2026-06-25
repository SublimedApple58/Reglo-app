# Staging — guida per gli sviluppatori

Ambiente di **pre-rilascio** del web/backend Reglo, separato da produzione (DB a
parte, invii esterni disattivati). URL: **https://staging.reglo.it**.

- È un **custom environment Vercel** nello stesso progetto `reglo`, agganciato al
  branch git **`staging`** (ogni push su `staging` rideploya).
- DB **Neon dedicato** (Francoforte), distinto da prod.
- `APP_ENV=staging` → **email/SMS/WhatsApp/push/fatture sono no-op** (anche con
  dati realistici, nessun cliente viene contattato). Vedi
  [`architecture/environments.md`](architecture/environments.md).

---

## 🔑 Account di test (login su staging)

Sul DB di staging c'è una demo **"Autoscuola Reglo"** (7 istruttori, flotta, ~28
allievi, agenda piena). Tutti gli account hanno la **stessa password**:

| Ruolo | Email | Password |
|-------|-------|----------|
| **Titolare** | `titolare@reglo.it` | `RegloTest2026!` |
| **Istruttore** | `istruttore@reglo.it` (Chiara Marino) | `RegloTest2026!` |
| **Allievo** | `allievo@reglo.it` (Davide Russo) | `RegloTest2026!` |

> Gli altri 6 istruttori e gli allievi esistono come dati ma senza login dedicato
> (email `marco.bianchi@reglo.it`, `allievo2@reglo.it`, … con la stessa password
> se ti serve entrarci). Ricreare/aggiornare la demo: `pnpm seed:staging:demo`.

---

## 🚪 Come si accede a staging (è protetto)

Staging è dietro **Vercel Deployment Protection**: non è pubblico.
- **Da browser**: se sei nel team Vercel e loggato, `staging.reglo.it` si apre.
- **Da strumenti/test/app mobile**: serve l'header **`x-vercel-protection-bypass`**
  con il *Protection Bypass for Automation* secret (Vercel → `reglo` → Settings →
  Deployment Protection). In CI è il GitHub secret `VERCEL_AUTOMATION_BYPASS_SECRET`.

---

## 🛠️ Comandi (web, dalla root `reglo/`)

| Comando | Cosa fa |
|---------|---------|
| `pnpm ship:staging` | Mergia il **branch corrente** in `staging` e pusha → deploy. Si ferma se hai modifiche non committate. |
| `pnpm migrate:staging` | Applica le migrazioni Prisma sul **DB di staging** (`prisma migrate deploy`). Come `migrate:prod` ma su staging. |
| `pnpm seed:staging:demo` | (Ri)crea la demo "Autoscuola Reglo" sul DB staging. |
| `pnpm db:staging:query "SELECT …"` | Query **read-only** sul DB staging. |
| `pnpm build:staging` / `start:staging` / `studio:staging` | Build / start / Prisma Studio puntati a staging. |

> `migrate:staging`, `seed:*`, `db:staging:query`, `studio:staging` girano in
> **locale** e richiedono il file `.env.staging` (vedi *Setup* sotto). `ship:staging`
> invece no (lavora solo su git).

### Flusso tipico pre-rilascio
```
git checkout -b feature/xxx        # lavori la feature
… commit …
pnpm ship:staging                  # → deploy su staging.reglo.it + CI smoke
# (se la feature ha migrazioni nuove)
pnpm migrate:staging
# QA su staging → quando ok, si rilascia in prod (merge in main + migrate:prod)
```

La CI **Staging Smoke** (`.github/workflows/staging-smoke.yml`) gira a ogni push su
`staging` e verifica login + dashboard + agenda + UI veicoli.

---

## 📱 Mobile su staging (`reglo-mobile/`)

```bash
npm run ios:staging       # simulatore iOS → staging.reglo.it
npm run android:staging   # emulatore Android → staging.reglo.it
```
Puntano l'app a `https://staging.reglo.it/api` e mandano l'header di bypass.
Richiede il file **`reglo-mobile/.staging-bypass`** (gitignored) col secret:
```bash
printf '%s' '<protection-bypass-secret>' > reglo-mobile/.staging-bypass
```

---

## ⚙️ Setup di un dev (una tantum)

1. **`.env.staging`** (root `reglo/`, gitignored) per i comandi locali:
   ```bash
   vercel link                                   # collega il progetto reglo (una volta)
   vercel env pull --environment=staging .env.staging
   ```
   Le variabili **Sensitive** (DB + URL) tornano vuote dal pull: completale a mano
   in fondo a `.env.staging` (i valori del DB li copi da Vercel → Storage → DB Neon
   di staging → Connection):
   ```
   APP_ENV=staging
   NEXT_PUBLIC_SERVER_URL=https://staging.reglo.it
   NEXTAUTH_URL=https://staging.reglo.it
   NEXTAUTH_URL_INTERNAL=https://staging.reglo.it
   DATABASE_URL=<pooled, host con -pooler>
   DIRECT_URL=<unpooled/diretta, host senza -pooler>
   ```
   La lista completa delle chiavi è in [`architecture/environments.md`](architecture/environments.md).
   *(In alternativa: fatti passare `.env.staging` dal titolare via vault/canale sicuro. Non committarlo: `.env*` è gitignored.)*

2. **`reglo-mobile/.staging-bypass`** col Protection Bypass secret (vedi sopra),
   solo se devi far girare il mobile contro staging.

---

## 🔒 Note di sicurezza
- Il DB di staging è **isolato** da prod: una scrittura su staging non tocca prod.
- Con `APP_ENV=staging` **nessun invio reale** parte da staging (guard in
  `lib/app-env.ts`). Se aggiungi una nuova integrazione "che invia", guardala con
  `externalSendsDisabled()`.
- Non committare mai `.env.staging` né `.staging-bypass` (entrambi gitignored).
