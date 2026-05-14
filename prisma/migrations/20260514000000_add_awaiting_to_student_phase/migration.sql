-- Extend the AutoscuolaStudentPhase enum with a new "AWAITING" value.
-- Used for students who register on autoscuole that have the TEORIA phase
-- enabled but have not yet received a quiz license seat from the titolare.
--
-- This must be in its own migration: Postgres does not allow ALTER TYPE ADD VALUE
-- to be combined with other statements in the same transaction.

ALTER TYPE "AutoscuolaStudentPhase" ADD VALUE 'AWAITING' BEFORE 'TEORIA';
