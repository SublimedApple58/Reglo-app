# Git flow & ambienti — Reglo

Come si lavora con i branch e gli ambienti **dev → staging → prod**. Vale per entrambi i repo (`reglo` web/backend e `reglo-mobile`). Dettagli ambiente staging: [STAGING.md](../STAGING.md) e [environments.md](environments.md).

## Branch & ambienti

| Branch | Ambiente | URL | DB | Note |
|--------|----------|-----|----|----|
| _feature branch_ (es. `feature/vehicles-redesign`) | dev locale | localhost | Neon **dev** (`.env.dev`) | dove si sviluppa |
| **`staging`** | **pre-rilascio (CONDIVISO)** | `staging.reglo.it` | Neon **staging** dedicato (Francoforte) | `APP_ENV=staging` → invii esterni **no-op**; protetto (bypass) |
| **`main`** (reglo) / **`master`** (reglo-mobile) | **produzione** | `app.reglo.it` | Neon **prod** | clienti veri |

- **`staging` è un branch CONDIVISO** con gli altri dev (ci pushano tutti). Trattalo come tale.
- **Lavori grossi / multi-fase → branch dedicato su ENTRAMBI i repo** (`reglo` e `reglo-mobile`), mai diretto su `main`/`master` finché il lavoro non è finito e approvato.

## Flusso di lavoro

```
feature branch  ──(1) allinea staging──►  ──(2) ship:staging──►  staging.reglo.it  ──(3) QA──►  ──(4) merge prod──►  app.reglo.it
```

### 1. Prima di shippare: allinea `staging` NEL tuo branch (SEMPRE)
Mai fare `ship:staging` a freddo: `staging` è condiviso, potrebbe avere migrazioni/commit di altri.

```bash
git fetch origin
git merge --no-edit origin/staging        # porta il lavoro altrui NEL tuo branch
# poi: controlla migrazioni nuove in prisma/migrations, applica/allinea su dev se serve,
#      risolvi eventuali conflitti (codice + schema.prisma)
```

Così il successivo merge verso `staging` è pulito e le migrazioni altrui emergono subito (evita drift sul DB condiviso).

### 2. Ship su staging
```bash
pnpm ship:staging      # dal feature branch: merge feature→staging + push (Vercel rideploya). Si ferma se hai modifiche non committate o conflitti.
pnpm migrate:staging   # SOLO se ci sono migrazioni nuove → le applica al DB di staging
```
Ogni push su `staging` fa partire anche la CI **Staging Smoke** (`.github/workflows/staging-smoke.yml`).

### 3. QA su staging
QA manuale su `staging.reglo.it` (vedi account di test in [STAGING.md](../STAGING.md)). Mobile contro staging: `npm run ios:staging` / `android:staging` in `reglo-mobile/`.

### 4. Rilascio in produzione (con OK esplicito dell'utente)
- **Web + backend** (`reglo`): merge `feature` → `main` → push → Vercel auto-deploya.
- **DB**: `pnpm migrate:prod` se ci sono migrazioni.
- **Background jobs**: `pnpm trigger:deploy:prod` se sono cambiati i job Trigger.dev.
- **Mobile** (`reglo-mobile`): merge `feature` → `master`, poi OTA: `eas update --platform ios --branch production` **poi** `--platform android` (MAI `--auto`, MAI `--platform all`). Native build solo se sono cambiati moduli nativi.

## Ambiente staging in breve
- **Vercel custom environment** nello stesso progetto `reglo` (non un progetto separato), agganciato al branch git `staging`, dominio `staging.reglo.it`.
- **DB Neon dedicato** (Francoforte), isolato da prod: una scrittura su staging non tocca prod.
- **`APP_ENV=staging`** → email/SMS/WhatsApp/push/fatture sono **no-op** (`lib/app-env.ts` `externalSendsDisabled()`). Se aggiungi un'integrazione "che invia", **guardala** con `externalSendsDisabled()`.
- **Protetto** da Vercel Deployment Protection: per strumenti/test/app mobile serve l'header `x-vercel-protection-bypass` (secret in [STAGING.md](../STAGING.md)).
- Comandi `:staging` (`ship`, `migrate`, `seed:staging:demo`, `db:staging:query`, …) e setup dev: [STAGING.md](../STAGING.md).

## Regole d'oro
1. **`staging` è condiviso** → allinealo nel tuo branch PRIMA di shippare (passo 1).
2. **Niente lavoro diretto su `main`/`master`** per task grossi → feature branch su entrambi i repo.
3. **Niente deploy/OTA in prod senza OK esplicito** dell'utente.
4. Stub di un modello Prisma aggiunto a mano per far girare `migrate dev`? **Rimuovilo** quando arriva il branch reale che lo possiede (altrimenti al merge → modello duplicato → build rotta).
