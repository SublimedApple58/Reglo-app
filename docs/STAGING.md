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

## 🚪 Come si accede a staging (è pubblico)

Dal **7 settembre 2026** la Vercel Deployment Protection è **spenta**:
`staging.reglo.it` (e i preview) si aprono da browser, Playwright, curl e app
mobile **senza** header di bypass né login Vercel. L'header
`x-vercel-protection-bypass` non serve più (se qualche script lo manda ancora,
viene ignorato).

### Catture con Playwright: la finestra «Novità»

Al primo accesso di ogni dispositivo la web app apre lo splash «Novità»
(`AgendaPauseNewsDialog`, «una volta per dispositivo» in `AutoscuoleShell`),
che copre la pagina e rovina screenshot e test. In un browser pulito va segnato
come già visto PRIMA di navigare:

```js
await context.addInitScript(() => {
  localStorage.setItem("reglo-news-seen:agenda-pausa-2026-07", "1");
});
```

Se in futuro cambia la chiave (costante `AGENDA_PAUSE_NEWS_KEY` in
`components/Layout/AutoscuoleShell.tsx`) o si aggiunge un'altra novità, aggiorna
questo snippet.

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

## 🚗 Reglo Road su staging

Road nasce spento (`CompanyService.limits.roadEnabled`, vale solo `=== true`). Su
staging è **acceso solo su «Autoscuola Reglo»** (`655e408a-…`, l'autoscuola attiva
di `titolare@reglo.it`, dal 29/10/2026); «Reglo E2E» resta spento.

- **Dal backoffice** (`/backoffice` › Autoscuole › «Gestisci» › card «Reglo Road»),
  se hai un accesso personale al backoffice di staging.
- **Da terminale** (stessa scrittura del backoffice + invalidazione della cache
  Redis delle impostazioni; rifiuta il DB di produzione):

  ```bash
  DOTENV_CONFIG_PATH=.env.staging NODE_OPTIONS=--require=dotenv/config \
    npx ts-node --transpile-only --compiler-options '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true}' \
    scripts/road-toggle.ts --on        # oppure --off, e --company <id> per un'altra autoscuola
  ```

- **Dati di prova dei punti critici** (8 guide passate con segnalazioni in tre
  incroci di Torino; idempotente, `--remove` per toglierle):
  `scripts/seed-road-hotspots.ts`, stesso comando con `.env.staging` o `.env.dev`.
- **La sede è a Milano, i dati di prova a Torino.** La sede di «Autoscuola Reglo»
  su staging è a Milano (circa 45.4654, 9.1859), mentre i punti critici e i
  percorsi d'esame di prova sono a Torino. Il giro (REG-647+) sceglie solo le
  tappe che stanno nella durata della guida, partendo dalla posizione
  dell'istruttore o, se manca, dalla sede: partendo da Milano il giro è vuoto e
  la card non compare. Per provarlo si parte da Torino: sul simulatore
  `xcrun simctl location booted set 45.0712,7.6855` (a volte va ripetuto e
  riaperta l'app), sulle API si passano `lat`/`lng` di Torino. Dal REG-653 la
  linea si chiude in sede: da Torino il ritorno a Milano allunga molto i minuti,
  quindi i test del ritorno in sede usano dati propri o sedi finte.
- **Script che chiamano i service Road** (`lib/autoscuole/road/*-service.ts`,
  `service.ts`): il codice Road **si porta dietro l'autenticazione**.
  `hotspots-service.ts`, `lesson-plan-service.ts` e `plan-service.ts` importano
  `road/service.ts`, che importa `requireServiceAccess` → `@/auth` → `next-auth`, e
  fuori da Next `next-auth` non si carica (`Cannot find module …/next/server`).
  Nello script, prima dei `require` del codice di prodotto, oltre a `server-only` e
  agli alias `@/` va dirottato anche `next-auth` (e `@/auth`) su un modulo finto:

  ```ts
  NodeModule._resolveFilename = function (request: string, ...rest: unknown[]) {
    if (/^(next-auth|@\/auth)(\/|$)/.test(request)) return "/percorso/stub.js"; // module.exports = new Proxy({}, { get: () => () => ({}) })
    if (request === "server-only") return originalResolve.call(this, "path", ...rest);
    const target = request.startsWith("@/") ? nodePath.join(REPO_ROOT, request.slice(2)) : request;
    return originalResolve.call(this, target, ...rest);
  };
  ```

  Così si possono chiamare le funzioni senza controlli di ruolo (es.
  `computeLessonPlan`, `companyHotspots`); quelle che passano da `roadContext()`
  invece richiedono una sessione vera e vanno provate con gli e2e.
- **Lo spec REG-638 non gira contro staging.** `tests/e2e/reg638-road.auth.spec.ts`
  prepara (e poi cancella) i suoi dati con `scripts/seed-reg638-road.ts` sempre sul
  **DB di dev** (`.env.dev` fisso nel `beforeAll`), qualunque sia `E2E_BASE_URL`.
  Contro `staging.reglo.it` il test «Dal vivo» non trova auto in guida e fallisce
  sempre: non è una regressione. Va lanciato solo contro il dev server locale; su
  staging valgono gli spec `reg64*`.
- Gli e2e Road (`tests/e2e/reg64*-road-*.auth.spec.ts`) girano sul titolare; quello
  dei punti critici entra anche come istruttore (`istruttore@reglo.it`) con token
  mobile e header `x-reglo-company-id`, perché l'account è in due autoscuole.

In **produzione** Road si accende solo dal backoffice: oggi è acceso solo su
«Autoscuola Maltese», il tenant di prova di Tiziano.

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
