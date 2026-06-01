# Prod Release — Pending DB Migrations

Tracks the Prisma migrations that exist on `feature/student-phase` but are **not
yet applied to production** (i.e. not on `main`). Run them at release time.

> Apply with: `pnpm migrate:prod` (runs `prisma migrate deploy` against the prod
> DB — applies every pending migration in lexical/folder order, idempotent).
> After deploy, redeploy the app so the regenerated Prisma client matches.

Last updated: 2026-06-01.

## Pending migrations (in apply order)

| # | Migration | What it does | Caveats |
|---|-----------|--------------|---------|
| 1 | `20260414161340` | Create `AutoscuolaStudentWeeklyAbsence` table (+ indexes, FKs) | ⚠️ **Out-of-order date**: folder is dated 2026-04-14, earlier than migrations already on prod (e.g. `20260416…`). `migrate deploy` will still apply it (it's pending), and the table is independent so it's safe — just don't be alarmed that an "old" migration runs. |
| 2 | `20260514000000_add_awaiting_to_student_phase` | `ALTER TYPE` add `AWAITING` to the student-phase enum | Enum `ADD VALUE` — must be its own migration (Postgres can't add + use an enum value in one tx). Runs fine via deploy. |
| 3 | `20260514000001_quiz_seats_phase_classified_and_limits_backfill` | `CompanyMember` columns for quiz seats / phase classification + limits backfill | Includes a data backfill — verify row counts after. |
| 4 | `20260525000000_add_practice_quiz_mode` | `ALTER TYPE "QuizSessionMode" ADD VALUE 'PRACTICE'` | Enum add value. |
| 5 | `20260526132043_add_quiz_schede` | `ALTER TYPE "QuizSessionMode" ADD VALUE 'SCHEDA'` + QuizScheda tables | Enum add value. |
| 6 | `20260527000000_add_exam_schede_type` | `ALTER TYPE "QuizSessionMode" ADD VALUE 'SCHEDA_ESAME'` + QuizScheda `type`/nullable chapterId | Enum add value; QuizScheda unique constraint changes to `(type, chapterId, schedaNumber)`. |
| 7 | `20260601142732_add_settings_perf_indexes` | Indexes `CompanyMember(companyId, autoscuolaRole)` and `AutoscuolaAppointment(companyId, studentId, paymentRequired, paymentStatus)` | ⚠️ `CREATE INDEX` (non-concurrent) **locks writes** on the table during creation. `AutoscuolaAppointment` may be large → run in a low-traffic window, or create the indexes manually with `CREATE INDEX CONCURRENTLY` and mark the migration as applied (`prisma migrate resolve --applied`). |

## Notes
- All 7 are already applied to the **dev** DB.
- Several are `ALTER TYPE … ADD VALUE` (enum extensions): harmless and fast, but
  each must stay in its own migration (already the case).
- The quiz "scheda esame" feature (#4–#6) is **in-progress** — confirm the
  feature is release-ready before applying to prod, since the schema changes go
  hand-in-hand with the quiz app code.

## After applying
- [ ] `pnpm migrate:prod` ran clean (all 7 reported as applied)
- [ ] App redeployed (Prisma client regenerated)
- [ ] Spot-check: settings screen + quiz schede flows on prod
- [ ] Remove migrations from this list once they're on `main`/prod
