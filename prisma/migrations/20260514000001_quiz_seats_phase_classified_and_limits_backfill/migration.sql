-- Quiz seats licensing model + phase classification flag + limits JSON backfill.
--
-- Adds:
--   * CompanyMember.quizSeatGrantedAt: nominal quiz license, set when the
--     titolare assigns a quiz seat to the student. Once set, the seat is
--     burnt for life (non-reassignable).
--   * CompanyMember.phaseClassifiedAt: tracks whether the titolare has
--     explicitly classified the student's phase (drives "Conferma fase"
--     yellow badge for students still on the default migration value).
--   * Indexes to support counter queries and phase-grouped lists.
--
-- Backfills CompanyService.limits for the AUTOSCUOLE service:
--   * Removes deprecated `quizEnabled` boolean.
--   * Adds `phasesEnabled: ["PRATICA"]` (legacy behaviour for all existing schools).
--   * Adds `autoAssignQuizOnSignup: false` (manual quiz licensing for all).
--   * Adds `quizSeats: 100` ONLY for autoscuole that had `quizEnabled = true`
--     (buffer to avoid commercial disruption; everyone else gets 0).
--
-- Per Bivio 2 ratificato: no backfill of quizSeatGrantedAt — production has
-- 0 students with completed QuizSession at migration time, so there is
-- nothing meaningful to preserve.

-- ============================================================================
-- Schema changes
-- ============================================================================

ALTER TABLE "CompanyMember"
  ADD COLUMN "quizSeatGrantedAt" TIMESTAMP(3),
  ADD COLUMN "phaseClassifiedAt" TIMESTAMP(3);

CREATE INDEX "CompanyMember_companyId_studentPhase_idx"
  ON "CompanyMember"("companyId", "studentPhase");

CREATE INDEX "CompanyMember_companyId_quizSeatGrantedAt_idx"
  ON "CompanyMember"("companyId", "quizSeatGrantedAt");

-- ============================================================================
-- Backfill CompanyService.limits for AUTOSCUOLE service
-- ============================================================================

-- Note: CompanyService.limits is `json` (not `jsonb`); we cast to jsonb for the
-- `-` and `||` operators, then back to json on write.
UPDATE "CompanyService"
SET limits = (
  (COALESCE(limits::jsonb, '{}'::jsonb) - 'quizEnabled')
  || jsonb_build_object(
    'phasesEnabled', '["PRATICA"]'::jsonb,
    'autoAssignQuizOnSignup', false,
    'quizSeats', CASE
      WHEN limits->>'quizEnabled' = 'true' THEN 100
      ELSE 0
    END
  )
)::json
WHERE "serviceKey" = 'AUTOSCUOLE';
