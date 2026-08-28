# Percorso patente — auto-selezione all'allievo self-registered (REG-410)

Quando un allievo si registra **in autonomia** dal mobile (self sign-up), al **primo accesso** deve scegliere da sé il proprio percorso patente (categoria + cambio). Gli allievi aggiunti manualmente dallo staff (web / inviti) **non** sono coinvolti: continuano ad avere la licenza impostata dal titolare.

## Modello dati

`prisma/schema.prisma` → `model CompanyMember`:

- `selfRegistered Boolean @default(false)` — `true` **solo** per chi si registra via `POST /api/mobile/auth/student-register`. Ogni altro percorso di creazione membership (staff web, inviti email, ecc.) resta `false`. Nessun backfill: tutti i membri esistenti restano `false` → mai gated.
- `licenseCategory String?` / `transmission String?` (già esistenti) — restano il luogo dove vive il percorso patente. Per un self sign-up ora nascono **NULL** (vedi sotto): è il NULL che, insieme a `selfRegistered`, attiva il gate.

Migrazione: `prisma/migrations/20260828000000_add_company_member_self_registered/` — `ALTER TABLE "CompanyMember" ADD COLUMN "selfRegistered" BOOLEAN NOT NULL DEFAULT false;` (additiva, no backfill).

Tassonomia condivisa: `lib/autoscuole/license.ts` → nuova costante `STUDENT_LICENSE_CATEGORIES = ['B','AM','A1','A2','A']` (+ type guard `isStudentLicenseCategory`). È il sottoinsieme di `LICENSE_CATEGORIES` che l'allievo può scegliere da sé (le pro/rimorchio BE/C/CE/D/DE restano staff-only). `TRANSMISSIONS` (`manual|automatic`) vale per **tutte** le categorie (auto e moto).

## File chiave

| Scope | File |
|------|------|
| Schema + migration | `prisma/schema.prisma`, `prisma/migrations/20260828000000_add_company_member_self_registered/` |
| Tassonomia | `lib/autoscuole/license.ts` (`STUDENT_LICENSE_CATEGORIES`, `isStudentLicenseCategory`) |
| Marca il self sign-up | `app/api/mobile/auth/student-register/route.ts` (`selfRegistered: true`, **niente** seed di licenza/cambio) |
| Espone il flag al mobile | `app/api/autoscuole/me/route.ts` (campo `needsLicensePath`) |
| Endpoint self-set | `app/api/autoscuole/me/license-path/route.ts` (`PATCH`, self-scoped) |
| Setter owner (invariato) | `lib/actions/autoscuole.actions.ts` → `updateStudentLicensePath` |

## Comportamento

### 1. Registrazione self (`student-register`)
La membership nasce con `selfRegistered: true` e `licenseCategory`/`transmission` **non impostati** (NULL). È stato rimosso il seed che prima li valorizzava dai default azienda (`limits.defaultLicenseCategory`/`defaultTransmission` → fallback `B`/`manual`). Il resto della logica (fase AWAITING/TEORIA/PRATICA, quiz seat, `AutoscuolaCase`) è invariato. Vale anche per chi si registra con **codice istruttore** (self sign-up a tutti gli effetti).

### 2. `GET /api/autoscuole/me`
Aggiunge al payload:
```ts
needsLicensePath: boolean   // membership.selfRegistered === true && !membership.licenseCategory
```
Additivo/retro-compat: i client vecchi lo ignorano. `membership` arriva già completa da `getActiveCompanyContext` (nessun `select` esplicito → include `selfRegistered`).

### 3. `PATCH /api/autoscuole/me/license-path` (nuovo, self-scoped)
- Solo `autoscuolaRole === "STUDENT"` (403 altrimenti).
- Solo `selfRegistered === true` (403 altrimenti — il percorso degli allievi manuali resta in mano allo staff).
- Body: `{ licenseCategory: STUDENT_LICENSE_CATEGORIES, transmission?: TRANSMISSIONS }`. Il `transmission` è valido per **tutte** le categorie; default difensivo `manual` se assente (il mobile lo invia sempre).
- **Idempotente**: se `licenseCategory` è già valorizzata (es. lo staff l'ha impostata nel frattempo) → no-op, risponde `needsLicensePath:false` senza sovrascrivere.
- Effetto: `updateMany` su `CompanyMember` (companyId+userId+STUDENT) → `licenseCategory` + `transmission`. Nessuna invalidazione cache extra (stesso pattern di `updateStudentLicensePath`).

## Connessioni

- → **Student Phase**: ortogonale alla fase. Il gate mobile è mostrato **prima** della home per-fase (a prescindere da AWAITING/TEORIA/PRATICA). Vedi `features/student-phase.md`.
- → **Vehicles / License**: `licenseCategory`+`transmission` guidano lo slot-matching category-aware solo se `vehiclesEnabled`. Durante la finestra pre-selezione (NULL) il gate blocca comunque l'uso dell'app, quindi nessuna prenotazione avviene con licenza NULL.
- → **Users Directory / creazione manuale**: `createCompanyUser` e gli inviti **non** settano `selfRegistered` → mai gated (la licenza la mette lo staff). Vedi `features/student-phase.md` §"Creazione account allievo da web".
- → **Aspetto / Agenda**: la directory allievi bootstrap legge `licenseCategory`/`transmission` per il colore-per-patente; un self sign-up pre-selezione ha licenza NULL finché non sceglie (non ancora in agenda).
- → **Mobile**: gate bloccante `LicensePathGateScreen`. Vedi `reglo-mobile/docs/features/license-path-gate.md`.

## Nota prodotto (REG-410)
Il **tipo di cambio** è una scelta **obbligatoria** e prominente al pari della categoria (nessun default; la conferma è bloccata finché non sono scelti sia categoria sia cambio) — decisione di Tiziano 2026-08-28.
