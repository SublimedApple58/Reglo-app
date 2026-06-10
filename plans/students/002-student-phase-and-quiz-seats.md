# Student Phase + Quiz Seats — modello SaaS commerciale

## What was done

Phase rollout from `AWAITING` → `TEORIA` → `PRATICA` → `PATENTATO`, sostituendo il legacy boolean `quizEnabled` con un modello a **posti quiz nominali a vita** (`quizSeats` per autoscuola, `quizSeatGrantedAt` per allievo).

### Phase 1 — Schema DB + migration (commit `13fc07c`)

- Enum esteso: `AutoscuolaStudentPhase { AWAITING, TEORIA, PRATICA, PATENTATO }`
- `CompanyMember.quizSeatGrantedAt: DateTime?` (seat a vita, mai revocato)
- `CompanyMember.phaseClassifiedAt: DateTime?` (badge "Conferma fase")
- `ServiceLimits` JSON: `phasesEnabled`, `quizSeats`, `autoAssignQuizOnSignup` (più indici `(companyId, studentPhase)` e `(companyId, quizSeatGrantedAt)`)
- Migration backfill: `phasesEnabled=['PRATICA']` per tutti, `quizSeats=100` per ex-quizEnabled, `0` altrove; rimosso `quizEnabled` dal JSON.

### Phase 2 — Backoffice Reglo admin (commit `97348bf`)

- Card "Fasi attive del percorso" (TEORIA/PRATICA checkbox, ≥1 obbligatoria)
- Card "Quiz Teoria — Gestione licenze" (input numerico + counter X/Y live, rosso se overflow)
- `BackofficeResolveTeoriaDeactivationDialog` per gestire disattivazione TEORIA con allievi attivi (bulk default "Passa a PRATICA", override per allievo)
- 3 action `lib/actions/backoffice.actions.ts`: `getQuizSeatsUsage`, `getTeoriaAffectedStudents`, `deactivateTeoriaWithResolution`.

### Phase 3 — Server actions runtime (commit `21f6f29`)

- `POST /api/mobile/auth/student-register` decide fase + seat in transaction (AWAITING / TEORIA+seat / PRATICA)
- `ensureStudentCanBookFromApp` blocca AWAITING + TEORIA con messaggi distinti
- `updateStudentPhase` accetta AWAITING + valida contro `phasesEnabled`, set `phaseClassifiedAt`
- 3 nuove action owner-only `lib/actions/autoscuole-settings.actions.ts`:
  - `getQuizSeatsContext()` — counter live per UI titolare
  - `grantQuizSeat({ studentId })` — solo per allievi AWAITING (PRATICA esplicitamente rifiutato)
  - `setAutoAssignQuizOnSignup({ enabled })` — toggle + FIFO promotion su OFF→ON
- `/api/autoscuole/me` ritorna anche `phasesEnabled`, `hasQuizAccess`, `autoAssignQuizOnSignup` (additive)

### Phase 4 — Web titolare (commit `82b3744`)

- `AutoscuoleStudentsPage`: banner "Licenze Quiz Teoria" (used/total + autoAssign indicator), sezione "In attesa di attivazione" con bottone "Assegna quiz", drawer con grant manuale, badge AWAITING ambra.
- `ChangeStudentPhaseDialog`: aggiunta opzione AWAITING + filtro `phasesEnabled`.
- `SettingsTab`: nuova accordion `RegistrationModeSection` (visibile solo se TEORIA attiva) per toggle `autoAssignQuizOnSignup` + preview FIFO promotion.

### Phase 5 — Mobile allievo (commit `cdc5274` su reglo-mobile)

- `AutoscuolaStudentPhase` esteso con AWAITING; `StudentPhasePayload` arricchito (campi optional → retro-compat).
- `useStudentPhase` espone `phasesEnabled`, `hasQuizAccess`, `autoAssignQuizOnSignup`.
- `AllievoAwaitingScreen` (nuovo): duck-clock + testo, nessuna CTA.
- `RoleHomeScreen` routing AWAITING → AllievoAwaitingScreen.
- `app/(tabs)/_layout.tsx`: AWAITING nasconde tutte le tab funzionali; tab Quiz richiede ora `phase === TEORIA && hasQuizAccess`.

### Phase 6 — Migrazione dati esistenti

Già eseguita in Phase 1 dalla migration di backfill (`quizSeats=100` per ex-quizEnabled, `0` altrove; `phasesEnabled=['PRATICA']`; no seat retroattivi per studenti perché prod non aveva sessioni quiz completate).

### Phase 7 — Documentazione

- Aggiornato `reglo/docs/features/student-phase.md` con il modello completo (AWAITING, seats, owner actions, backoffice actions).
- Aggiornato `reglo/docs/INDEX.md` (primary files arricchiti).
- Aggiornato `reglo/docs/impact-map.md` (Quiz Teoria + Student Phase + Quiz Seats).
- Aggiornato `reglo-mobile/docs/features/student-phase.md` con AWAITING screen, hasQuizAccess, tab visibility.
- Aggiornato `reglo-mobile/docs/INDEX.md` e `reglo-mobile/docs/impact-map.md`.

### Phase 8 — Deploy

Non ancora eseguita. Sequenza prevista (quando approvata):
1. Merge `feature/student-phase` → `main` su `reglo/` (Vercel auto-deploy)
2. `pnpm migrate:prod` per applicare le 2 migrazioni schema/backfill
3. Merge `feature/student-phase` → `master` su `reglo-mobile/`
4. `eas update --platform ios --branch production --message "student-phase + quiz seats"` poi stesso per android (mai `--platform all`)
5. Smoke test prod: registrare allievo su autoscuola test → verificare AWAITING + assegnazione seat dal web → verifica TEORIA → tab quiz appare → cambio a PRATICA → tab quiz sparisce.

## Decisioni ratificate

1. **Per ogni autoscuola** dal backoffice si decide quali fasi sono attive (`phasesEnabled`). Almeno una.
2. **`quizEnabled: boolean` → `quizSeats: number`**. Counter live "usati X / Y" nel backoffice + nel titolare.
3. **Seat = licenza nominale a vita**. Una volta assegnato, bruciato per sempre. Il contatore solo cresce.
4. **Nuovo stato AWAITING** per allievi registrati senza licenza.
5. **Setting titolare** `autoAssignQuizOnSignup` (toggle visibile solo se TEORIA attiva). OFF default.
6. **Auto-assign ON + 0 seat liberi** → fallback AWAITING (degrado soft).
7. **Onboarding allievo immediato** (nessun gate di approvazione titolare).
8. **Tab quiz mobile** visibile solo se `phase === TEORIA && hasQuizAccess`. Sparisce in PRATICA (seat resta consumato).
9. **Disattivazione TEORIA con allievi attivi**: dialog backoffice di risoluzione, default "Passa a PRATICA" con override.
10. **Toggle OFF→ON con AWAITING esistenti**: promozione FIFO immediata.
11. **`grantQuizSeat` da AWAITING → TEORIA**. Allievi in PRATICA NON possono ricevere seat (UI nasconde il bottone, server-side guard).
12. **API contract mobile retro-compatibile**: solo aggiunte di campi optional.

## Bivi ratificati a posteriori

- `grantQuizSeat` su PRATICA: **rifiutato server-side**. La UI nasconde il bottone per allievi non-AWAITING.
- Migrazione esistenti: `quizSeats = 100` per ex-`quizEnabled = true` (conservativo finché non si rinegozia).
- `AllievoAwaitingScreen` UX: duck-clock + testo, nessuna CTA.
- `ResolvePhasesDeactivationDialog`: 2 azioni ("Passa a PRATICA" / "Mantieni in fase attuale") + bulk default.
